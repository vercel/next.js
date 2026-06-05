use std::{borrow::Cow, io::Write};

use anyhow::Result;
use byteorder::{BE, WriteBytesExt};
use either::Either;
use next_core::app_structure::FileSystemPathVec;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToString, ValueToStringRef, Vc,
};
use turbo_tasks_fs::{
    File, FileContent, FileSystemPath,
    rope::{Rope, RopeBuilder},
};
use turbopack_analyze::split_chunk::{split_output_asset_into_parts, split_traced_file_into_parts};
use turbopack_core::{
    SOURCE_URL_PROTOCOL,
    asset::{Asset, AssetContent},
    chunk::{ChunkingType, TracedMode},
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph},
    output::{OutputAsset, OutputAssets, OutputAssetsReference},
    reference::all_assets_from_entries,
};

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

#[derive(Serialize)]
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

#[derive(Serialize)]
struct EdgesDataReference {
    pub offset: u32,
    pub length: u32,
}

#[derive(Serialize)]
struct AnalyzeDataHeader {
    pub sources: Vec<AnalyzeSource>,
    pub chunk_parts: Vec<AnalyzeChunkPart>,
    pub output_files: Vec<AnalyzeOutputFile>,
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

struct AnalyzeOutputFileBuilder {
    output_file: AnalyzeOutputFile,
    chunk_part_indices: Vec<u32>,
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
}

struct ModulesDataBuilder {
    modules: Vec<AnalyzeModuleBuilder>,
    module_index_map: FxHashMap<RcStr, u32>,
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
    fn new() -> Self {
        Self {
            sources: vec![],
            source_index_map: FxHashMap::default(),
            chunk_parts: vec![],
            output_files: vec![],
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

        let mut binary_section = EdgesDataSectionBuilder::new();

        let header = AnalyzeDataHeader {
            sources: self.sources.into_iter().map(|s| s.source).collect(),
            chunk_parts: self.chunk_parts,
            output_files: self
                .output_files
                .into_iter()
                .map(|of| of.output_file)
                .collect(),
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
    fn new() -> Self {
        Self {
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
) -> Result<Vc<FileContent>> {
    let output_assets = all_assets_from_entries(output_assets);

    let mut builder = AnalyzeDataBuilder::new();

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
        let chunk_parts = match asset {
            Either::Left(asset) => split_output_asset_into_parts(*asset).await?,
            Either::Right(path) => split_traced_file_into_parts(path).await?,
        };
        for chunk_part in &chunk_parts {
            let decoded_source = urlencoding::decode(&chunk_part.source)?;
            let source = if let Some(stripped) = decoded_source.strip_prefix(&prefix) {
                Cow::Borrowed(stripped)
            } else if decoded_source.starts_with("[project]/") {
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
    let mut builder = ModulesDataBuilder::new();

    let mut all_modules = FxIndexSet::default();
    let mut all_edges = FxIndexSet::default();
    let mut all_async_edges = FxIndexSet::default();
    let mut all_traced_edges = FxIndexSet::default();
    let mut traced_modules = FxHashSet::default();

    let module_graph = module_graph.await?;
    module_graph.traverse_edges_dfs(
        module_graph.graphs.iter().flat_map(|g| g.entry_modules()),
        &mut (),
        |parent, node, _| {
            all_modules.insert(node);
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

    let all_modules = all_modules
        .iter()
        .copied()
        .map(async |module| {
            let ident = module.ident().to_string().owned().await?;
            let path = module.ident().await?.path.to_string_ref().await?;
            Ok((ident, path))
        })
        .try_join()
        .await?;

    for (ident, path) in &all_modules {
        builder.ensure_module(ident, path);
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
}

#[turbo_tasks::value_impl]
impl AnalyzeDataOutputAsset {
    #[turbo_tasks::function]
    pub async fn new(
        path: FileSystemPath,
        output_assets: ResolvedVc<OutputAssets>,
        traced_files: ResolvedVc<FileSystemPathVec>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            path,
            output_assets,
            traced_files,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for AnalyzeDataOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        let file_content = analyze_output_assets(*self.output_assets, *self.traced_files);
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
