use std::{borrow::Cow, io::Write};

use anyhow::Result;
use bincode::{Decode, Encode};
use byteorder::{BE, WriteBytesExt};
use either::Either;
use next_core::app_structure::FileSystemPathVec;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, JoinIterExt, NonLocalValue, ResolvedVc, TryFlatJoinIterExt, ValueToString,
    ValueToStringRef, Vc,
};
use turbo_tasks_fs::{
    File, FileContent, FileSystemPath,
    rope::{Rope, RopeBuilder},
};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_analyze::split_chunk::{split_output_asset_into_parts, split_traced_file_into_parts};
use turbopack_browser::ecmascript::EcmascriptBrowserChunk;
use turbopack_core::{
    SOURCE_URL_PROTOCOL,
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkItem, ChunkingType, TracedMode},
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph},
    output::{OutputAsset, OutputAssets, OutputAssetsReference},
    reference::all_assets_from_entries,
};
use turbopack_css::chunk::CssChunk;
use turbopack_ecmascript::{
    async_chunk::module::AsyncLoaderModule,
    chunk::{EcmascriptChunk, EcmascriptChunkItemOrBatchWithAsyncInfo},
    manifest::{chunk_asset::ManifestAsyncModule, loader_module::ManifestLoaderModule},
    references::service_worker::{ServiceWorkerEntryModule, service_worker_chunk_filename},
};

use crate::route::AnalyzeChunkGroups;

pub struct EdgesData {
    pub offsets: Vec<u32>,
    pub data: Vec<u32>,
}

impl EdgesData {
    fn from_iterator<'a>(iterable: impl IntoIterator<Item = &'a Vec<u32>> + Clone) -> Self {
        let mut current_offset = 0;
        let sum: usize = iterable.clone().into_iter().map(|v| v.len()).sum();
        let mut data = Vec::with_capacity(sum);
        let offsets = iterable
            .into_iter()
            .map(|edges| {
                current_offset += edges.len() as u32;
                data.extend(edges);
                current_offset
            })
            .collect();
        Self { offsets, data }
    }

    fn write(&self, writer: &mut impl Write) -> Result<()> {
        writer.write_u32::<BE>(self.offsets.len() as u32)?;
        for &offset in &self.offsets {
            writer.write_u32::<BE>(offset)?;
        }
        for &data in &self.data {
            writer.write_u32::<BE>(data)?;
        }
        Ok(())
    }
}

#[derive(Serialize)]
pub struct AnalyzeSource {
    pub parent_source_index: Option<u32>,
    /// Path. When there is a parent, this is concatenated to the parent's path.
    /// Folders end with a slash. Might have multiple path segments when folders contain only a
    /// single child.
    pub path: RcStr,
}

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode, Serialize)]
pub struct AnalyzeModule {
    pub ident: RcStr,
    pub path: RcStr,
}

#[derive(Serialize)]
pub struct AnalyzeChunkPart {
    pub source_index: u32,
    pub output_file_index: u32,
    pub size: u32,
    pub compressed_size: u32,
}

#[derive(Serialize)]
pub struct AnalyzeOutputFile {
    pub filename: RcStr,
}

/// Exact endpoint graph root. Client roles and references are build-time
/// provenance; neither establishes that a browser requested a chunk.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Serialize)]
pub struct AnalyzeRouteEntry {
    pub route_entry_id: RcStr,
    pub module_ident: RcStr,
    pub module_path: RcStr,
    pub role: RcStr,
    pub runtime: Option<RcStr>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_kind: Option<RcStr>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub client_references: Vec<AnalyzeClientReferenceEntry>,
}

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode, Serialize)]
pub struct AnalyzeClientReferenceEntry {
    pub module_ident: RcStr,
    pub module_path: RcStr,
    pub reference_kind: RcStr,
}

#[turbo_tasks::value(transparent)]
pub struct AnalyzeRouteEntries(Vec<AnalyzeRouteEntry>);

pub type AnalyzeGraphModule = ResolvedVc<Box<dyn Module>>;
pub type AnalyzeSyncDependents = FxHashMap<AnalyzeGraphModule, Vec<AnalyzeGraphModule>>;
pub type AnalyzeWorkerRegistration = (AnalyzeGraphModule, ResolvedVc<ServiceWorkerEntryModule>);

/// Snapshot-scoped module order shared by both artifact writers. Never regenerate
/// indices independently from a route graph or use them across analyzer snapshots.
#[turbo_tasks::value(shared)]
pub struct AnalyzeModuleIndex {
    pub modules: Vec<AnalyzeModule>,
    pub by_ident: FxHashMap<RcStr, u32>,
    /// Fingerprint of the exact ordered module identities serialized in modules.data.
    pub module_index_hash: RcStr,
    /// Cached once for the whole application, not rebuilt for each route.
    pub sync_dependents: AnalyzeSyncDependents,
    pub worker_registrations: Vec<AnalyzeWorkerRegistration>,
}

#[turbo_tasks::function]
pub async fn analyze_module_index(module_graph: Vc<ModuleGraph>) -> Result<Vc<AnalyzeModuleIndex>> {
    let mut all_modules = FxIndexSet::default();
    let mut sync_dependents: AnalyzeSyncDependents = FxHashMap::default();
    let mut registrations = FxIndexSet::default();
    let graph = module_graph.await?;
    graph.traverse_edges_dfs(
        graph.all_entry_modules(),
        &mut (),
        |parent, node, _| {
            all_modules.insert(node);
            if let Some((importer, reference)) = parent {
                if !matches!(
                    reference.chunking_type,
                    ChunkingType::Async | ChunkingType::Traced { .. }
                ) {
                    sync_dependents.entry(node).or_default().push(importer);
                }
                if let Some(marker) =
                    ResolvedVc::try_downcast_type::<ServiceWorkerEntryModule>(node)
                {
                    registrations.insert((importer, marker));
                }
            }
            Ok(GraphTraversalAction::Continue)
        },
        |_, _, _| Ok(()),
        true,
    )?;
    let mut modules = Vec::with_capacity(all_modules.len());
    let mut by_ident = FxHashMap::default();
    let idents_and_paths = all_modules
        .iter()
        .copied()
        .map(async |module| {
            let ident = module.ident().to_string().owned().await?;
            let path = module.ident().await?.path.to_string_ref().await?;
            anyhow::Ok((ident, path))
        })
        .join()
        .await;
    for pair in idents_and_paths {
        let (ident, path) = pair?;
        if by_ident.contains_key(&ident) {
            continue;
        }
        by_ident.insert(ident.clone(), modules.len() as u32);
        modules.push(AnalyzeModule { ident, path });
    }
    let module_index_hash = format!(
        "{:016x}",
        hash_xxh3_hash64(
            modules
                .iter()
                .map(|module| (module.ident.as_str(), module.path.as_str()))
                .collect::<Vec<_>>()
        )
    )
    .into();
    Ok(AnalyzeModuleIndex {
        modules,
        by_ident,
        module_index_hash,
        sync_dependents,
        worker_registrations: registrations.into_iter().collect(),
    }
    .cell())
}

pub fn analyze_route_entry_id(
    route: &str,
    role: &str,
    endpoint_index: usize,
    sub_name: &str,
    module_ident: &str,
) -> RcStr {
    format!("{route}|{role}|{endpoint_index}|{sub_name}|{module_ident}").into()
}

#[derive(Serialize)]
struct EdgesDataReference {
    pub offset: u32,
    pub length: u32,
}

#[derive(Serialize)]
struct AnalyzeDataHeader {
    /// The header and modules.data must use the same supported schema version.
    pub schema_version: u32,
    pub module_index_hash: RcStr,
    pub sources: Vec<AnalyzeSource>,
    pub chunk_parts: Vec<AnalyzeChunkPart>,
    pub output_files: Vec<AnalyzeOutputFile>,
    /// Exact indices into this snapshot's modules.data.modules, one row per output file.
    pub output_file_modules: EdgesDataReference,
    pub output_file_module_coverage: Vec<AnalyzeOutputFileCoverage>,
    /// Non-asset reference wrappers whose direct runtime load type is unknown.
    pub unresolved_output_references: Vec<u32>,
    pub unjoined_modules: Vec<AnalyzeUnjoinedModule>,
    pub chunk_groups: Vec<AnalyzeChunkGroupData>,
    pub chunk_load_edges: Vec<AnalyzeChunkLoadEdge>,
    pub unjoined_chunk_load_edges: Vec<AnalyzeUnjoinedChunkLoadEdge>,
    /// Exact endpoint roots; nested client references do not become roots.
    pub route_entries: Vec<AnalyzeRouteEntry>,
    /// Edges from chunks to chunk parts
    pub output_file_chunk_parts: EdgesDataReference,
    /// Edges from sources to chunk parts
    pub source_chunk_parts: EdgesDataReference,
    /// Edges from sources to their children sources
    pub source_children: EdgesDataReference,
    /// Root level sources, walking their children will reach all sources
    pub source_roots: Vec<u32>,
}

#[derive(Serialize)]
struct ModulesDataHeader {
    pub schema_version: u32,
    pub module_index_hash: RcStr,
    pub modules: Vec<AnalyzeModule>,
    /// Edges from modules to modules
    pub module_dependents: EdgesDataReference,
    /// Edges from modules to modules
    pub async_module_dependents: EdgesDataReference,
    /// Edges from modules to modules
    pub traced_module_dependents: EdgesDataReference,
    /// Edges from modules to modules
    pub module_dependencies: EdgesDataReference,
    /// Edges from modules to modules
    pub async_module_dependencies: EdgesDataReference,
    /// Edges from modules to modules
    pub traced_module_dependencies: EdgesDataReference,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum AnalyzeOutputFileCoverage {
    Exact,
    Unsupported,
    NotAChunk,
}

#[derive(Serialize)]
struct AnalyzeUnjoinedModule {
    output_file_index: u32,
    module_ident: RcStr,
    reason: &'static str,
}

#[derive(Serialize)]
struct AnalyzeChunkGroupData {
    id: u32,
    kind: RcStr,
    #[serde(skip_serializing_if = "Option::is_none")]
    trigger_module_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unjoined_trigger_ident: Option<RcStr>,
    /// Direct emitted output_file indices; group membership is not a claim that
    /// an individual reference contributes every module in a cumulative group.
    output_file_indices: Vec<u32>,
}

#[derive(Serialize)]
struct AnalyzeChunkLoadEdge {
    source_output_file_index: u32,
    target_output_file_index: u32,
    kind: RcStr,
    #[serde(skip_serializing_if = "Option::is_none")]
    trigger_module_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unjoined_trigger_ident: Option<RcStr>,
}

#[derive(Serialize)]
struct AnalyzeUnjoinedChunkLoadEdge {
    #[serde(skip_serializing_if = "Option::is_none")]
    source_output_file_index: Option<u32>,
    target_path: RcStr,
    kind: RcStr,
    reason: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    trigger_module_ident: Option<RcStr>,
}

struct ChunkLoadCandidate {
    source: u32,
    target: ResolvedVc<Box<dyn OutputAsset>>,
    kind: RcStr,
    trigger_module_index: Option<u32>,
    unjoined_trigger_ident: Option<RcStr>,
}

struct AnalyzeOutputFileBuilder {
    output_file: AnalyzeOutputFile,
    chunk_part_indices: Vec<u32>,
    module_indices: Vec<u32>,
    module_coverage: AnalyzeOutputFileCoverage,
    unresolved_references: u32,
}

struct AnalyzeSourceBuilder {
    source: AnalyzeSource,
    child_source_indices: Vec<u32>,
    chunk_part_indices: Vec<u32>,
}

struct AnalyzeModuleBuilder {
    module: AnalyzeModule,
    dependencies: FxIndexSet<u32>,
    async_dependencies: FxIndexSet<u32>,
    traced_dependencies: FxIndexSet<u32>,
    dependents: FxIndexSet<u32>,
    async_dependents: FxIndexSet<u32>,
    traced_dependents: FxIndexSet<u32>,
}

struct AnalyzeDataBuilder {
    sources: Vec<AnalyzeSourceBuilder>,
    source_index_map: FxHashMap<RcStr, u32>,
    chunk_parts: Vec<AnalyzeChunkPart>,
    output_files: Vec<AnalyzeOutputFileBuilder>,
    route_entries: Vec<AnalyzeRouteEntry>,
    module_index_hash: RcStr,
    unjoined_modules: Vec<AnalyzeUnjoinedModule>,
    chunk_groups: Vec<AnalyzeChunkGroupData>,
    chunk_load_edges: Vec<AnalyzeChunkLoadEdge>,
    unjoined_chunk_load_edges: Vec<AnalyzeUnjoinedChunkLoadEdge>,
}

struct ModulesDataBuilder {
    modules: Vec<AnalyzeModuleBuilder>,
    module_index_map: FxHashMap<RcStr, u32>,
    module_index_hash: RcStr,
}

struct EdgesDataSectionBuilder {
    data: Vec<u8>,
}

impl EdgesDataSectionBuilder {
    fn new() -> Self {
        Self { data: vec![] }
    }

    fn add_edges(&mut self, edges: &EdgesData) -> EdgesDataReference {
        let offset = self.data.len().try_into().unwrap();
        edges.write(&mut self.data).unwrap();
        let length = (self.data.len() - offset as usize).try_into().unwrap();
        EdgesDataReference { offset, length }
    }
}

impl AnalyzeDataBuilder {
    fn new(route_entries: Vec<AnalyzeRouteEntry>, module_index_hash: RcStr) -> Self {
        Self {
            module_index_hash,
            sources: vec![],
            source_index_map: FxHashMap::default(),
            chunk_parts: vec![],
            output_files: vec![],
            route_entries,
            unjoined_modules: vec![],
            chunk_groups: vec![],
            chunk_load_edges: vec![],
            unjoined_chunk_load_edges: vec![],
        }
    }

    fn ensure_source(&mut self, path: &str) -> (&mut AnalyzeSourceBuilder, u32) {
        if let Some(&index) = self.source_index_map.get(path) {
            return (&mut self.sources[index as usize], index);
        }
        let index = self.sources.len() as u32;
        let path = RcStr::from(path);
        self.source_index_map.insert(path.clone(), index);
        self.sources.push(AnalyzeSourceBuilder {
            source: AnalyzeSource {
                parent_source_index: None,
                path,
            },
            child_source_indices: vec![],
            chunk_part_indices: vec![],
        });
        (&mut self.sources[index as usize], index)
    }

    fn add_chunk_part(&mut self, chunk_part: AnalyzeChunkPart) -> u32 {
        let i = self.chunk_parts.len() as u32;
        self.chunk_parts.push(chunk_part);
        i
    }

    fn add_output_file(&mut self, output_file: AnalyzeOutputFile) -> u32 {
        let i = self.output_files.len() as u32;
        self.output_files.push(AnalyzeOutputFileBuilder {
            output_file,
            chunk_part_indices: vec![],
            module_indices: vec![],
            module_coverage: AnalyzeOutputFileCoverage::NotAChunk,
            unresolved_references: 0,
        });
        i
    }

    fn add_chunk_part_to_output_file(&mut self, output_file_index: u32, chunk_part_index: u32) {
        self.output_files[output_file_index as usize]
            .chunk_part_indices
            .push(chunk_part_index);
    }

    fn add_chunk_part_to_source(&mut self, source_index: u32, chunk_part_index: u32) {
        self.sources[source_index as usize]
            .chunk_part_indices
            .push(chunk_part_index);
    }

    fn build(self) -> Rope {
        let source_roots = self
            .sources
            .iter()
            .enumerate()
            .filter_map(|(i, s)| {
                if s.source.parent_source_index.is_none() {
                    Some(i as u32)
                } else {
                    None
                }
            })
            .collect();

        let source_children =
            EdgesData::from_iterator(self.sources.iter().map(|s| &s.child_source_indices));

        let source_chunk_parts =
            EdgesData::from_iterator(self.sources.iter().map(|s| &s.chunk_part_indices));

        let output_file_chunk_parts =
            EdgesData::from_iterator(self.output_files.iter().map(|of| &of.chunk_part_indices));
        let output_file_modules =
            EdgesData::from_iterator(self.output_files.iter().map(|of| &of.module_indices));

        let mut binary_section = EdgesDataSectionBuilder::new();

        let header = AnalyzeDataHeader {
            schema_version: 1,
            module_index_hash: self.module_index_hash,
            sources: self.sources.into_iter().map(|s| s.source).collect(),
            chunk_parts: self.chunk_parts,
            output_file_module_coverage: self
                .output_files
                .iter()
                .map(|of| of.module_coverage)
                .collect(),
            output_file_modules: binary_section.add_edges(&output_file_modules),
            unresolved_output_references: self
                .output_files
                .iter()
                .map(|of| of.unresolved_references)
                .collect(),
            output_files: self
                .output_files
                .into_iter()
                .map(|of| of.output_file)
                .collect(),
            unjoined_modules: self.unjoined_modules,
            chunk_groups: self.chunk_groups,
            chunk_load_edges: self.chunk_load_edges,
            unjoined_chunk_load_edges: self.unjoined_chunk_load_edges,
            route_entries: self.route_entries,
            output_file_chunk_parts: binary_section.add_edges(&output_file_chunk_parts),
            source_chunk_parts: binary_section.add_edges(&source_chunk_parts),
            source_children: binary_section.add_edges(&source_children),
            source_roots,
        };

        let header_json = serde_json::to_vec(&header).unwrap();

        let mut rope = RopeBuilder::default();
        rope.push_bytes(&(header_json.len() as u32).to_be_bytes());
        rope.reserve_bytes(header_json.len() + binary_section.data.len());
        rope.push_bytes(&header_json);
        rope.push_bytes(&binary_section.data);
        rope.build()
    }
}

impl ModulesDataBuilder {
    fn new(module_index_hash: RcStr) -> Self {
        Self {
            module_index_hash,
            modules: vec![],
            module_index_map: FxHashMap::default(),
        }
    }

    fn get_module(&mut self, ident: &str) -> (&mut AnalyzeModuleBuilder, u32) {
        if let Some(&index) = self.module_index_map.get(ident) {
            return (&mut self.modules[index as usize], index);
        }
        panic!("Module with ident `{}` not found", ident);
    }

    fn ensure_module(&mut self, ident: &str, path: &str) -> (&mut AnalyzeModuleBuilder, u32) {
        if let Some(&index) = self.module_index_map.get(ident) {
            return (&mut self.modules[index as usize], index);
        }
        let index = self.modules.len() as u32;
        let ident = RcStr::from(ident);
        let path = RcStr::from(path);
        self.module_index_map.insert(ident.clone(), index);
        self.modules.push(AnalyzeModuleBuilder {
            module: AnalyzeModule { ident, path },
            dependencies: FxIndexSet::default(),
            async_dependencies: FxIndexSet::default(),
            traced_dependencies: FxIndexSet::default(),
            dependents: FxIndexSet::default(),
            async_dependents: FxIndexSet::default(),
            traced_dependents: FxIndexSet::default(),
        });
        (&mut self.modules[index as usize], index)
    }

    fn build(self) -> Rope {
        let module_dependencies_vecs: Vec<Vec<u32>> = self
            .modules
            .iter()
            .map(|s| s.dependencies.iter().copied().collect())
            .collect();
        let async_module_dependencies_vecs: Vec<Vec<u32>> = self
            .modules
            .iter()
            .map(|s| s.async_dependencies.iter().copied().collect())
            .collect();
        let traced_module_dependencies_vecs: Vec<Vec<u32>> = self
            .modules
            .iter()
            .map(|s| s.traced_dependencies.iter().copied().collect())
            .collect();
        let module_dependents_vecs: Vec<Vec<u32>> = self
            .modules
            .iter()
            .map(|s| s.dependents.iter().copied().collect())
            .collect();
        let async_module_dependents_vecs: Vec<Vec<u32>> = self
            .modules
            .iter()
            .map(|s| s.async_dependents.iter().copied().collect())
            .collect();
        let traced_module_dependents_vecs: Vec<Vec<u32>> = self
            .modules
            .iter()
            .map(|s| s.traced_dependents.iter().copied().collect())
            .collect();

        let module_dependencies = EdgesData::from_iterator(&module_dependencies_vecs);
        let async_module_dependencies = EdgesData::from_iterator(&async_module_dependencies_vecs);
        let traced_module_dependencies = EdgesData::from_iterator(&traced_module_dependencies_vecs);
        let module_dependents = EdgesData::from_iterator(&module_dependents_vecs);
        let async_module_dependents = EdgesData::from_iterator(&async_module_dependents_vecs);
        let traced_module_dependents = EdgesData::from_iterator(&traced_module_dependents_vecs);

        let mut binary_section = EdgesDataSectionBuilder::new();

        let header = ModulesDataHeader {
            schema_version: 1,
            module_index_hash: self.module_index_hash,
            modules: self.modules.into_iter().map(|s| s.module).collect(),
            module_dependents: binary_section.add_edges(&module_dependents),
            async_module_dependents: binary_section.add_edges(&async_module_dependents),
            traced_module_dependents: binary_section.add_edges(&traced_module_dependents),
            module_dependencies: binary_section.add_edges(&module_dependencies),
            async_module_dependencies: binary_section.add_edges(&async_module_dependencies),
            traced_module_dependencies: binary_section.add_edges(&traced_module_dependencies),
        };

        let header_json = serde_json::to_vec(&header).unwrap();

        let mut rope = RopeBuilder::default();
        rope.push_bytes(&(header_json.len() as u32).to_be_bytes());
        rope.reserve_bytes(header_json.len() + binary_section.data.len());
        rope.push_bytes(&header_json);
        rope.push_bytes(&binary_section.data);
        rope.build()
    }
}

/// Join an emitted chunk item's module to the same snapshot used for modules.data.
async fn join_chunk_item(
    module: Vc<Box<dyn Module>>,
    module_index: &AnalyzeModuleIndex,
    output_file_index: u32,
    indices: &mut FxIndexSet<u32>,
    unjoined: &mut Vec<AnalyzeUnjoinedModule>,
) -> Result<()> {
    let ident = module.ident().to_string().owned().await?;
    if let Some(&index) = module_index.by_ident.get(&ident) {
        indices.insert(index);
    } else {
        unjoined.push(AnalyzeUnjoinedModule {
            output_file_index,
            module_ident: ident,
            reason: "outside_whole_app_module_graph",
        });
    }
    Ok(())
}

/// The source chunk contains a loader/manifest item that explicitly references
/// these async assets. Generic output references are not evidence of an async load.
async fn chunk_item_load_candidates(
    item: ResolvedVc<Box<dyn turbopack_ecmascript::chunk::EcmascriptChunkItem>>,
    index: &AnalyzeModuleIndex,
    source: u32,
) -> Result<Vec<ChunkLoadCandidate>> {
    let module = item.module().to_resolved().await?;
    let kind = if ResolvedVc::try_downcast_type::<AsyncLoaderModule>(module).is_some()
        || ResolvedVc::try_downcast_type::<ManifestAsyncModule>(module).is_some()
    {
        "async"
    } else if ResolvedVc::try_downcast_type::<ManifestLoaderModule>(module).is_some() {
        "async_manifest"
    } else {
        return Ok(vec![]);
    };
    let ident = module.ident().to_string().owned().await?;
    let (trigger_module_index, unjoined_trigger_ident) = match index.by_ident.get(&ident) {
        Some(&i) => (Some(i), None),
        None => (None, Some(ident)),
    };
    let references = item.references().await?;
    let assets = references.assets.await?;
    Ok(assets
        .iter()
        .copied()
        .map(|target| ChunkLoadCandidate {
            source,
            target,
            kind: kind.into(),
            trigger_module_index,
            unjoined_trigger_ident: unjoined_trigger_ident.clone(),
        })
        .collect())
}

/// Get exact constituent module identities only for chunk types whose items we
/// can enumerate. Empty rows marked unsupported must not be treated as empty chunks.
async fn output_chunk_modules(
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    filename: &str,
    module_index: &AnalyzeModuleIndex,
    output_file_index: u32,
) -> Result<(
    Vec<u32>,
    AnalyzeOutputFileCoverage,
    Vec<AnalyzeUnjoinedModule>,
    Vec<ChunkLoadCandidate>,
    u32,
)> {
    let mut indices = FxIndexSet::default();
    let mut unjoined = Vec::new();
    let mut candidates = Vec::new();
    let mut enumerated = true;
    if let Some(browser_chunk) = ResolvedVc::try_downcast_type::<EcmascriptBrowserChunk>(asset) {
        let chunk: ResolvedVc<Box<dyn Chunk>> = browser_chunk.chunk().to_resolved().await?;
        let chunk = ResolvedVc::try_downcast_type::<EcmascriptChunk>(chunk)
            .ok_or_else(|| anyhow::anyhow!("browser output did not contain an ecmascript chunk"))?;
        let content = chunk.await?.content.await?;
        for chunk_item in &content.chunk_items {
            match chunk_item {
                EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(item) => {
                    join_chunk_item(
                        item.chunk_item.module(),
                        module_index,
                        output_file_index,
                        &mut indices,
                        &mut unjoined,
                    )
                    .await?;
                    candidates.extend(
                        chunk_item_load_candidates(
                            item.chunk_item,
                            module_index,
                            output_file_index,
                        )
                        .await?,
                    );
                }
                EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                    for item in &batch.await?.chunk_items {
                        join_chunk_item(
                            item.chunk_item.module(),
                            module_index,
                            output_file_index,
                            &mut indices,
                            &mut unjoined,
                        )
                        .await?;
                        candidates.extend(
                            chunk_item_load_candidates(
                                item.chunk_item,
                                module_index,
                                output_file_index,
                            )
                            .await?,
                        );
                    }
                }
            }
        }
    } else if let Some(chunk) = ResolvedVc::try_downcast_type::<CssChunk>(asset) {
        let content = chunk.await?.content.await?;
        for chunk_item in &content.chunk_items {
            join_chunk_item(
                chunk_item.module(),
                module_index,
                output_file_index,
                &mut indices,
                &mut unjoined,
            )
            .await?;
        }
    } else if filename.ends_with(".js") || filename.ends_with(".css") {
        // Other emitted JS/CSS wrappers (evaluate/runtime entries, workers) still
        // record their generic references below, but their members are unknown.
        enumerated = false;
    } else {
        return Ok((
            vec![],
            AnalyzeOutputFileCoverage::NotAChunk,
            vec![],
            vec![],
            0,
        ));
    }
    let references = asset.references().await?;
    let unresolved_references = references.references.await?.len() as u32;
    for &target in references
        .assets
        .await?
        .iter()
        .chain(references.referenced_assets.await?.iter())
    {
        if target != asset {
            candidates.push(ChunkLoadCandidate {
                source: output_file_index,
                target,
                kind: "asset_reference".into(),
                trigger_module_index: None,
                unjoined_trigger_ident: None,
            });
        }
    }
    let coverage = if enumerated && unjoined.is_empty() {
        AnalyzeOutputFileCoverage::Exact
    } else {
        AnalyzeOutputFileCoverage::Unsupported
    };
    Ok((
        indices.into_iter().collect(),
        coverage,
        unjoined,
        candidates,
        unresolved_references,
    ))
}

/// Merges two sets of output assets into one. Used to combine per-route output
/// assets with shared assets (e.g. `_app`, `_document`) at report generation time.
#[turbo_tasks::function]
pub async fn combine_output_assets(
    primary: Vc<OutputAssets>,
    extra: Vc<OutputAssets>,
) -> Result<Vc<OutputAssets>> {
    let mut combined: Vec<ResolvedVc<Box<dyn OutputAsset>>> =
        primary.await?.iter().copied().collect();
    combined.extend(extra.await?.iter().copied());
    Ok(Vc::cell(combined))
}

/// Merges two sets of traced modules into one. Used to combine per-route traced
/// modules with shared modules (e.g. `_app`, `_document`) at report generation time.
#[turbo_tasks::function]
pub async fn combine_traced_files(
    primary: Vc<FileSystemPathVec>,
    extra: Vc<FileSystemPathVec>,
) -> Result<Vc<FileSystemPathVec>> {
    let mut combined: Vec<FileSystemPath> = primary.await?.iter().cloned().collect();
    combined.extend(extra.await?.iter().cloned());
    Ok(Vc::cell(combined))
}

#[turbo_tasks::function]
pub async fn analyze_output_assets(
    output_assets: Vc<OutputAssets>,
    traced_files: Vc<FileSystemPathVec>,
    route_entries: Vc<AnalyzeRouteEntries>,
    chunk_groups: Vc<AnalyzeChunkGroups>,
    module_graph: Vc<ModuleGraph>,
) -> Result<Vc<FileContent>> {
    let output_assets = all_assets_from_entries(output_assets);
    let route_entries = route_entries.await?.iter().cloned().collect();
    let module_index = analyze_module_index(module_graph).await?;

    let mut builder =
        AnalyzeDataBuilder::new(route_entries, module_index.module_index_hash.clone());
    let mut asset_indices: FxHashMap<ResolvedVc<Box<dyn OutputAsset>>, Vec<u32>> =
        FxHashMap::default();
    let mut candidates = Vec::new();
    let mut browser_chunks = FxHashSet::default();

    let prefix = format!("{SOURCE_URL_PROTOCOL}///");

    // Process the output assets and extract chunk parts.
    // Also creates sources for the chunk parts.
    for asset in output_assets
        .await?
        .iter()
        .copied()
        .map(Either::Left)
        .chain(traced_files.await?.iter().cloned().map(Either::Right))
    {
        let file_system_path = match &asset {
            Either::Left(asset) => Either::Left(asset.path().await?),
            Either::Right(path) => Either::Right(path),
        };
        let path = match &file_system_path {
            Either::Left(path) => &path.path,
            Either::Right(path) => &path.path,
        };
        if path.ends_with(".map") || path.ends_with(".nft.json") {
            // Skip source maps.
            continue;
        }

        let filename = match &file_system_path {
            Either::Left(path) => path.to_string_ref().await?,
            Either::Right(path) => path.to_string_ref().await?,
        };

        let output_file_index = builder.add_output_file(AnalyzeOutputFile {
            filename: filename.clone(),
        });
        if let Either::Left(asset) = &asset {
            asset_indices
                .entry(*asset)
                .or_default()
                .push(output_file_index);
            if ResolvedVc::try_downcast_type::<EcmascriptBrowserChunk>(*asset).is_some() {
                browser_chunks.insert(output_file_index);
            }
            let (indices, coverage, unjoined, edges, unresolved) =
                output_chunk_modules(*asset, &filename, &module_index, output_file_index).await?;
            candidates.extend(edges);
            let file = &mut builder.output_files[output_file_index as usize];
            file.module_indices = indices;
            file.module_coverage = coverage;
            file.unresolved_references = unresolved;
            builder.unjoined_modules.extend(unjoined);
        }
        let chunk_parts = match asset {
            Either::Left(asset) => split_output_asset_into_parts(*asset).await?,
            Either::Right(path) => split_traced_file_into_parts(path).await?,
        };
        for chunk_part in &chunk_parts {
            let decoded_source = urlencoding::decode(&chunk_part.source)?;
            let source = if let Some(stripped) = decoded_source.strip_prefix(&prefix) {
                Cow::Borrowed(stripped)
            } else if decoded_source.starts_with('[') && decoded_source.contains("]/") {
                decoded_source
            } else {
                Cow::Owned(format!(
                    "[project]/{}",
                    decoded_source.trim_start_matches("../")
                ))
            };
            let source_index = builder.ensure_source(&source).1;
            let size = chunk_part.real_size + chunk_part.unaccounted_size;
            let chunk_part_index = builder.add_chunk_part(AnalyzeChunkPart {
                source_index,
                output_file_index,
                size,
                compressed_size: chunk_part.get_compressed_size().await?.unwrap_or(size),
            });
            builder.add_chunk_part_to_output_file(output_file_index, chunk_part_index);
            builder.add_chunk_part_to_source(source_index, chunk_part_index);
        }
    }

    let mut async_groups = FxHashMap::default();
    for candidate in candidates {
        if let Some(target_indices) = asset_indices.get(&candidate.target) {
            let load_targets = target_indices
                .iter()
                .copied()
                .filter(|&target| target != candidate.source)
                .collect::<Vec<_>>();
            if load_targets.is_empty() {
                continue;
            }
            if candidate.kind == "async" || candidate.kind == "async_manifest" {
                let key = (
                    candidate.source,
                    candidate.trigger_module_index,
                    candidate.unjoined_trigger_ident.clone(),
                );
                let group_index = *async_groups.entry(key).or_insert_with(|| {
                    let index = builder.chunk_groups.len();
                    builder.chunk_groups.push(AnalyzeChunkGroupData {
                        id: index as u32,
                        kind: "async".into(),
                        trigger_module_index: candidate.trigger_module_index,
                        unjoined_trigger_ident: candidate.unjoined_trigger_ident.clone(),
                        output_file_indices: vec![],
                    });
                    index
                });
                for &target in &load_targets {
                    if !builder.chunk_groups[group_index]
                        .output_file_indices
                        .contains(&target)
                    {
                        builder.chunk_groups[group_index]
                            .output_file_indices
                            .push(target);
                    }
                }
            }
            for &target in &load_targets {
                builder.chunk_load_edges.push(AnalyzeChunkLoadEdge {
                    source_output_file_index: candidate.source,
                    target_output_file_index: target,
                    kind: candidate.kind.clone(),
                    trigger_module_index: candidate.trigger_module_index,
                    unjoined_trigger_ident: candidate.unjoined_trigger_ident.clone(),
                });
            }
        } else {
            let target_path = candidate.target.path().await?.to_string_ref().await?;
            if target_path.ends_with(".map") || target_path.ends_with(".nft.json") {
                continue;
            }
            builder
                .unjoined_chunk_load_edges
                .push(AnalyzeUnjoinedChunkLoadEdge {
                    source_output_file_index: Some(candidate.source),
                    target_path,
                    kind: candidate.kind,
                    reason: "target_not_in_route_outputs",
                    trigger_module_ident: candidate.unjoined_trigger_ident,
                });
        }
    }
    for group in chunk_groups.await?.iter() {
        let id = builder.chunk_groups.len() as u32;
        let mut output_indices = FxIndexSet::default();
        for &asset in group.assets.await?.iter() {
            let Some(indices) = asset_indices.get(&asset) else {
                let path = asset.path().await?.to_string_ref().await?;
                anyhow::bail!("chunk-group asset {path} not present among emitted output files");
            };
            output_indices.extend(indices.iter().copied());
        }
        let (trigger_module_index, unjoined_trigger_ident) = if let Some(module) = group.trigger {
            let ident = module.ident().to_string().owned().await?;
            if let Some(&index) = module_index.by_ident.get(&ident) {
                (Some(index), None)
            } else {
                (None, Some(ident))
            }
        } else {
            (None, None)
        };
        builder.chunk_groups.push(AnalyzeChunkGroupData {
            id,
            kind: group.kind.clone(),
            trigger_module_index,
            unjoined_trigger_ident,
            output_file_indices: output_indices.into_iter().collect(),
        });
    }

    // A service-worker marker lives in the page graph, but its payload is compiled
    // from a different graph. Join the registration importer to the worker output;
    // never treat worker-internal modules as members of the page graph.
    let worker_files: FxHashSet<u32> = builder
        .chunk_groups
        .iter()
        .filter(|group| group.kind == "worker")
        .flat_map(|group| group.output_file_indices.iter().copied())
        .collect();
    if !worker_files.is_empty() {
        for &(importer, marker) in &module_index.worker_registrations {
            let marker = marker.await?;
            let filename = service_worker_chunk_filename(&marker.scope);
            let importer_ident = importer.ident().to_string().owned().await?;
            let importer_index = module_index.by_ident.get(&importer_ident).copied();
            for target in &worker_files {
                let output = &builder.output_files[*target as usize].output_file.filename;
                if !output.ends_with(filename.as_str()) {
                    continue;
                }
                builder.unjoined_modules.push(AnalyzeUnjoinedModule {
                    output_file_index: *target,
                    module_ident: marker.inner.ident().to_string().owned().await?,
                    reason: "worker_compiled_in_separate_graph",
                });
                // A registration can live in a generated `<locals>` module, whereas
                // the emitted chunk item belongs to its enclosing client module.
                // Follow only synchronous dependents until an emitted browser item
                // owns the source; never climb across an async/traced edge.
                let mut sources = FxIndexSet::default();
                let mut pending = vec![importer];
                let mut seen = FxHashSet::default();
                while let Some(module) = pending.pop() {
                    if !seen.insert(module) {
                        continue;
                    }
                    let ident = module.ident().to_string().owned().await?;
                    let mut found = false;
                    if let Some(&index) = module_index.by_ident.get(&ident) {
                        for (i, file) in builder.output_files.iter().enumerate() {
                            if browser_chunks.contains(&(i as u32))
                                && file.module_indices.contains(&index)
                            {
                                sources.insert(i as u32);
                                found = true;
                            }
                        }
                    }
                    if !found && let Some(parents) = module_index.sync_dependents.get(&module) {
                        pending.extend(parents.iter().copied());
                    }
                }
                if sources.is_empty() {
                    builder
                        .unjoined_chunk_load_edges
                        .push(AnalyzeUnjoinedChunkLoadEdge {
                            source_output_file_index: None,
                            target_path: output.clone(),
                            kind: "worker_registration".into(),
                            reason: "importer_not_in_browser_chunk",
                            trigger_module_ident: Some(importer_ident.clone()),
                        });
                } else {
                    for source in sources {
                        builder.chunk_load_edges.push(AnalyzeChunkLoadEdge {
                            source_output_file_index: source,
                            target_output_file_index: *target,
                            kind: "worker_registration".into(),
                            trigger_module_index: importer_index,
                            unjoined_trigger_ident: None,
                        });
                    }
                }
            }
        }
    }

    // One edge may be found by more than one item in a batch or registration;
    // preserve distinct kinds but never duplicate the same typed relationship.
    let mut seen_edges = FxHashSet::default();
    builder.chunk_load_edges.retain(|edge| {
        seen_edges.insert((
            edge.source_output_file_index,
            edge.target_output_file_index,
            edge.kind.clone(),
            edge.trigger_module_index,
            edge.unjoined_trigger_ident.clone(),
        ))
    });
    let mut seen_unjoined = FxHashSet::default();
    builder.unjoined_modules.retain(|module| {
        seen_unjoined.insert((
            module.output_file_index,
            module.module_ident.clone(),
            module.reason,
        ))
    });

    // Build a directory structure for the sources.
    let mut i: u32 = 0;
    while i < builder.sources.len().try_into().unwrap() {
        let source = &builder.sources[i as usize];
        let path = source.source.path.as_str();
        if !path.is_empty() {
            let (parent_path, path) = if let Some(pos) = path.trim_end_matches('/').rfind('/') {
                (&path[..pos + 1], &path[pos + 1..])
            } else {
                ("", path)
            };
            let parent_path = parent_path.to_string();
            let path = path.into();
            let (parent_source, parent_index) = builder.ensure_source(&parent_path);
            parent_source.child_source_indices.push(i);
            builder.sources[i as usize].source.parent_source_index = Some(parent_index);
            builder.sources[i as usize].source.path = path;
        }
        i += 1;
    }

    let rope = builder.build();
    Ok(FileContent::Content(File::from(rope)).cell())
}

#[turbo_tasks::function]
pub async fn analyze_module_graphs(module_graph: Vc<ModuleGraph>) -> Result<Vc<FileContent>> {
    let module_index = analyze_module_index(module_graph).await?;
    let mut builder = ModulesDataBuilder::new(module_index.module_index_hash.clone());

    let mut all_edges = FxIndexSet::default();
    let mut all_async_edges = FxIndexSet::default();
    let mut all_traced_edges = FxIndexSet::default();
    let mut traced_modules = FxHashSet::default();

    let module_graph = module_graph.await?;
    module_graph.traverse_edges_dfs(
        module_graph.all_entry_modules(),
        &mut (),
        |parent, node, _| {
            let Some((parent_node, reference)) = parent else {
                return Ok(GraphTraversalAction::Continue);
            };

            // ChunkingType::Traced{TracedMode::Entry}     => target is always traced
            // ChunkingType::Traced{TracedMode::Transitive}=> target only traced if parent is traced
            // ChunkingType::*                             => target only traced if parent is traced
            if matches!(
                reference.chunking_type,
                ChunkingType::Traced {
                    mode: TracedMode::Entry
                }
            ) || traced_modules.contains(&parent_node)
            {
                traced_modules.insert(node);
                all_traced_edges.insert((parent_node, node));
                return Ok(GraphTraversalAction::Continue);
            };

            match reference.chunking_type {
                ChunkingType::Async => {
                    all_async_edges.insert((parent_node, node));
                }
                _ => {
                    all_edges.insert((parent_node, node));
                }
            }
            Ok(GraphTraversalAction::Continue)
        },
        |_, _, _| Ok(()),
        true,
    )?;

    type ModulePair = (ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Module>>);
    async fn mapper((from, to): ModulePair) -> Result<Option<(RcStr, RcStr)>> {
        if from == to {
            return Ok(None);
        }
        let from_ident = from.ident().to_string().owned().await?;
        let to_ident = to.ident().to_string().owned().await?;
        Ok(Some((from_ident, to_ident)))
    }

    for module in &module_index.modules {
        builder.ensure_module(&module.ident, &module.path);
    }

    let all_edges = all_edges
        .iter()
        .copied()
        .map(mapper)
        .try_flat_join()
        .await?;
    let all_async_edges = all_async_edges
        .iter()
        .copied()
        .map(mapper)
        .try_flat_join()
        .await?;
    let all_traced_edges = all_traced_edges
        .iter()
        .copied()
        .map(mapper)
        .try_flat_join()
        .await?;
    for (from_ident, to_ident) in all_edges {
        let from_index = builder.get_module(&from_ident).1;
        let to_index = builder.get_module(&to_ident).1;
        if from_index == to_index {
            continue;
        }
        builder.modules[from_index as usize]
            .dependencies
            .insert(to_index);
        builder.modules[to_index as usize]
            .dependents
            .insert(from_index);
    }
    for (from_ident, to_ident) in all_async_edges {
        let from_index = builder.get_module(&from_ident).1;
        let to_index = builder.get_module(&to_ident).1;
        if from_index == to_index {
            continue;
        }
        builder.modules[from_index as usize]
            .async_dependencies
            .insert(to_index);
        builder.modules[to_index as usize]
            .async_dependents
            .insert(from_index);
    }
    for (from_ident, to_ident) in all_traced_edges {
        let from_index = builder.get_module(&from_ident).1;
        let to_index = builder.get_module(&to_ident).1;
        if from_index == to_index {
            continue;
        }
        builder.modules[from_index as usize]
            .traced_dependencies
            .insert(to_index);
        builder.modules[to_index as usize]
            .traced_dependents
            .insert(from_index);
    }

    let rope = builder.build();
    Ok(FileContent::Content(File::from(rope)).cell())
}

#[turbo_tasks::value]
pub struct AnalyzeDataOutputAsset {
    pub path: FileSystemPath,
    pub output_assets: ResolvedVc<OutputAssets>,
    pub traced_files: ResolvedVc<FileSystemPathVec>,
    pub route_entries: ResolvedVc<AnalyzeRouteEntries>,
    pub chunk_groups: ResolvedVc<AnalyzeChunkGroups>,
    pub module_graph: ResolvedVc<ModuleGraph>,
}

#[turbo_tasks::value_impl]
impl AnalyzeDataOutputAsset {
    #[turbo_tasks::function]
    pub async fn new(
        path: FileSystemPath,
        output_assets: ResolvedVc<OutputAssets>,
        traced_files: ResolvedVc<FileSystemPathVec>,
        route_entries: ResolvedVc<AnalyzeRouteEntries>,
        chunk_groups: ResolvedVc<AnalyzeChunkGroups>,
        module_graph: ResolvedVc<ModuleGraph>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            path,
            output_assets,
            traced_files,
            route_entries,
            chunk_groups,
            module_graph,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for AnalyzeDataOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        let file_content = analyze_output_assets(
            *self.output_assets,
            *self.traced_files,
            *self.route_entries,
            *self.chunk_groups,
            *self.module_graph,
        );
        AssetContent::file(file_content)
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for AnalyzeDataOutputAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for AnalyzeDataOutputAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}

#[turbo_tasks::value]
pub struct ModulesDataOutputAsset {
    pub path: FileSystemPath,
    pub module_graph: ResolvedVc<ModuleGraph>,
}

#[turbo_tasks::value_impl]
impl ModulesDataOutputAsset {
    #[turbo_tasks::function]
    pub async fn new(
        path: FileSystemPath,
        module_graph: ResolvedVc<ModuleGraph>,
    ) -> Result<Vc<Self>> {
        Ok(Self { path, module_graph }.cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModulesDataOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        let file_content = analyze_module_graphs(*self.module_graph);
        AssetContent::file(file_content)
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for ModulesDataOutputAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for ModulesDataOutputAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        AnalyzeClientReferenceEntry, AnalyzeDataBuilder, AnalyzeOutputFile,
        AnalyzeOutputFileCoverage, AnalyzeRouteEntry, ModulesDataBuilder, analyze_route_entry_id,
    };

    fn header_and_binary(rope: turbo_tasks_fs::rope::Rope) -> (serde_json::Value, Vec<u8>) {
        let data = rope.to_bytes();
        let json_len = u32::from_be_bytes(data[..4].try_into().unwrap()) as usize;
        let header = serde_json::from_slice(&data[4..4 + json_len]).unwrap();
        (header, data[4 + json_len..].to_vec())
    }

    fn read_rows(binary: &[u8], reference: &serde_json::Value) -> Vec<Vec<u32>> {
        let offset = reference["offset"].as_u64().unwrap() as usize;
        let length = reference["length"].as_u64().unwrap() as usize;
        let section = &binary[offset..offset + length];
        let words = section
            .as_chunks::<4>()
            .0
            .iter()
            .map(|bytes| u32::from_be_bytes(*bytes))
            .collect::<Vec<_>>();
        let rows = words[0] as usize;
        assert_eq!(
            words.len(),
            rows + 1 + words[1..=rows].last().copied().unwrap_or(0) as usize
        );
        let mut start = 0;
        (0..rows)
            .map(|i| {
                let end = words[i + 1] as usize;
                let row = words[1 + rows + start..1 + rows + end].to_vec();
                start = end;
                row
            })
            .collect()
    }

    #[test]
    fn output_file_modules_join_exact_snapshot_module_indices() {
        let mut module_builder = ModulesDataBuilder::new("ordered-index-fingerprint".into());
        module_builder.ensure_module("module/a", "a.ts");
        module_builder.ensure_module("module/b", "b.ts");
        let (modules_header, _) = header_and_binary(module_builder.build());
        let mut route_builder = AnalyzeDataBuilder::new(vec![], "ordered-index-fingerprint".into());
        let first = route_builder.add_output_file(AnalyzeOutputFile {
            filename: "chunk.js".into(),
        });
        route_builder.output_files[first as usize].module_indices = vec![1, 0];
        route_builder.output_files[first as usize].module_coverage =
            AnalyzeOutputFileCoverage::Exact;
        route_builder.add_output_file(AnalyzeOutputFile {
            filename: "other.txt".into(),
        });
        let (route_header, binary) = header_and_binary(route_builder.build());
        assert_eq!(
            modules_header["schema_version"],
            route_header["schema_version"]
        );
        assert_eq!(route_header["schema_version"], 1);
        assert_eq!(
            route_header["output_file_module_coverage"],
            serde_json::json!(["exact", "not_a_chunk"])
        );
        let rows = read_rows(&binary, &route_header["output_file_modules"]);
        assert_eq!(rows, vec![vec![1, 0], vec![]]);
        assert_eq!(
            modules_header["modules"][rows[0][0] as usize]["ident"],
            "module/b"
        );
        assert_eq!(
            modules_header["modules"][rows[0][1] as usize]["ident"],
            "module/a"
        );
    }

    #[test]
    fn client_references_are_nested_and_do_not_claim_initial_load() {
        let entry = AnalyzeRouteEntry {
            route_entry_id: "route|route|0||rsc".into(),
            module_ident: "rsc".into(),
            module_path: "[project]/app/page.tsx".into(),
            role: "route".into(),
            runtime: None,
            entry_kind: Some("server".into()),
            client_references: vec![AnalyzeClientReferenceEntry {
                module_ident: "client".into(),
                module_path: "[project]/app/client.tsx".into(),
                reference_kind: "ecmascript".into(),
            }],
        };
        let json = serde_json::to_value([entry]).unwrap();
        assert_eq!(json.as_array().unwrap().len(), 1);
        assert_eq!(json[0]["module_ident"], "rsc");
        assert_eq!(json[0]["entry_kind"], "server");
        assert_eq!(json[0]["client_references"][0]["module_ident"], "client");
        assert!(json[0].get("initial").is_none());
        assert!(json[0].get("load_scope").is_none());
    }

    #[test]
    fn route_entry_ids_preserve_endpoint_variant_and_shared_role() {
        let first = analyze_route_entry_id("/settings", "route", 0, "@main", "module");
        let second = analyze_route_entry_id("/settings", "route", 1, "@modal", "module");
        let shared = analyze_route_entry_id("_app", "shared", 0, "", "module");
        assert_ne!(first, second);
        assert_ne!(first, shared);
        assert_ne!(second, shared);
    }

    #[test]
    fn unavailable_client_provenance_does_not_gain_a_role() {
        let entry = AnalyzeRouteEntry {
            route_entry_id: "route|route|0||unknown".into(),
            module_ident: "unknown".into(),
            module_path: "[project]/app/route.ts".into(),
            role: "route".into(),
            runtime: None,
            entry_kind: None,
            client_references: vec![],
        };
        let json = serde_json::to_value(entry).unwrap();
        assert!(json.get("entry_kind").is_none());
        assert!(json.get("client_references").is_none());
    }
}
