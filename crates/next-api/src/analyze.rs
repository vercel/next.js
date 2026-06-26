use std::{borrow::Cow, collections::VecDeque, io::Write};

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

use crate::route::ModuleGraphs;

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
    /// Source indices of modules that are only reachable via async (dynamic
    /// import) edges from this route's entries. Computed per-route against the
    /// route's module graph, so a module statically imported on another route
    /// can still be async-only here.
    pub async_only_sources: Vec<u32>,
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
    async_only_sources: FxHashSet<u32>,
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
            async_only_sources: FxHashSet::default(),
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

    fn set_async_only_sources(&mut self, sources: FxHashSet<u32>) {
        self.async_only_sources = sources;
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

        let mut async_only_sources: Vec<u32> = self.async_only_sources.into_iter().collect();
        async_only_sources.sort_unstable();

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
            async_only_sources,
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

/// Classified edges from a module graph traversal.
///
/// `static_edges`, `async_edges`, and `traced_edges` are `(from, to)` module
/// pairs. `traced_modules` is the set of modules reached via NFT tracing.
/// `modules` is every module visited during the traversal (reachable from the
/// entries).
struct ClassifiedEdges {
    modules: FxIndexSet<ResolvedVc<Box<dyn Module>>>,
    static_edges: FxIndexSet<(ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Module>>)>,
    async_edges: FxIndexSet<(ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Module>>)>,
    traced_edges: FxIndexSet<(ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Module>>)>,
    traced_modules: FxHashSet<ResolvedVc<Box<dyn Module>>>,
}

/// Traverse `module_graph` from its entries and classify every edge as static,
/// async, or traced. This is the same logic used by `analyze_module_graphs`,
/// factored out so the per-route analyzer can reuse it for async-only source
/// classification.
fn classify_module_graph_edges(module_graph: &ModuleGraph) -> Result<ClassifiedEdges> {
    let mut modules = FxIndexSet::default();
    let mut static_edges = FxIndexSet::default();
    let mut async_edges = FxIndexSet::default();
    let mut traced_edges = FxIndexSet::default();
    let mut traced_modules = FxHashSet::default();

    module_graph.traverse_edges_dfs(
        module_graph.all_entry_modules(),
        &mut (),
        |parent, node, _| {
            modules.insert(node);
            let Some((parent_node, reference)) = parent else {
                return Ok(GraphTraversalAction::Continue);
            };

            if matches!(
                reference.chunking_type,
                ChunkingType::Traced {
                    mode: TracedMode::Entry
                }
            ) || traced_modules.contains(&parent_node)
            {
                traced_modules.insert(node);
                traced_edges.insert((parent_node, node));
                return Ok(GraphTraversalAction::Continue);
            };

            match reference.chunking_type {
                ChunkingType::Async => {
                    async_edges.insert((parent_node, node));
                }
                _ => {
                    static_edges.insert((parent_node, node));
                }
            }
            Ok(GraphTraversalAction::Continue)
        },
        |_, _, _| Ok(()),
        true,
    )?;

    Ok(ClassifiedEdges {
        modules,
        static_edges,
        async_edges,
        traced_edges,
        traced_modules,
    })
}

/// Compute the set of modules reachable from `entries` by following only the
/// given static edges. Pure and generic over the module identity type so it
/// can be unit-tested without a real turbo-tasks module graph.
fn compute_static_reachable<M>(entries: &[M], static_edges: &[(M, M)]) -> FxHashSet<M>
where
    M: Copy + Eq + std::hash::Hash,
{
    let mut adjacency: FxHashMap<M, Vec<M>> = FxHashMap::default();
    for (from, to) in static_edges {
        adjacency.entry(*from).or_default().push(*to);
    }

    let mut reachable: FxHashSet<M> = FxHashSet::default();
    let mut queue: VecDeque<M> = VecDeque::new();
    for entry in entries {
        if reachable.insert(*entry) {
            queue.push_back(*entry);
        }
    }
    while let Some(current) = queue.pop_front() {
        if let Some(neighbors) = adjacency.get(&current) {
            for to in neighbors {
                if reachable.insert(*to) {
                    queue.push_back(*to);
                }
            }
        }
    }
    reachable
}

/// Given the set of all visited modules, the static-reachable set, the traced
/// set, and a per-module mapping to source indices, return the source indices
/// that are *exclusively* async-reachable.
///
/// A single source path can correspond to multiple module instances (e.g.
/// client vs ssr layer variants of the same file). The source is async-only
/// only if it has at least one mapped module AND *every* mapped module
/// instance is async-only — if any variant is static-reachable or traced, the
/// source is not exclusively async.
fn aggregate_async_only_sources<M, I>(
    all_modules: I,
    static_reachable: &FxHashSet<M>,
    traced_modules: &FxHashSet<M>,
    module_to_source: impl Fn(&M) -> Option<u32>,
) -> FxHashSet<u32>
where
    M: Copy + Eq + std::hash::Hash,
    I: IntoIterator<Item = M>,
{
    #[derive(Default)]
    struct SourceStatus {
        has_module: bool,
        has_static_or_traced: bool,
    }
    let mut source_status: FxHashMap<u32, SourceStatus> = FxHashMap::default();

    for module in all_modules {
        let Some(source_index) = module_to_source(&module) else {
            continue;
        };
        let status = source_status.entry(source_index).or_default();
        status.has_module = true;
        if static_reachable.contains(&module) || traced_modules.contains(&module) {
            status.has_static_or_traced = true;
        }
    }

    source_status
        .into_iter()
        .filter_map(|(idx, s)| (s.has_module && !s.has_static_or_traced).then_some(idx))
        .collect()
}

/// Compute the set of source indices that are only reachable via async (dynamic
/// import) edges within a single route's module graph(s).
///
/// A module is async-only when no path from a route entry to it crosses only
/// static edges, and it is not traced-only. We BFS from the entries over static
/// edges to find `static_reachable`, then aggregate per-source via
/// [`aggregate_async_only_sources`] (a source is async-only only if every
/// module variant mapping to it is async-only).
///
/// When multiple module graphs are provided (a route may have several), a
/// module is static-reachable if it is static-reachable in *any* graph, and
/// async-only only if it is async-only in *every* graph that contains it.
async fn compute_async_only_sources(
    module_graphs: Vec<ResolvedVc<ModuleGraph>>,
    source_index_map: &FxHashMap<RcStr, u32>,
) -> Result<FxHashSet<u32>> {
    // Union of static-reachable modules across all graphs.
    let mut static_reachable: FxHashSet<ResolvedVc<Box<dyn Module>>> = FxHashSet::default();
    // Union of traced modules across all graphs.
    let mut traced_modules: FxHashSet<ResolvedVc<Box<dyn Module>>> = FxHashSet::default();
    // Every module visited in any graph.
    let mut all_modules: FxIndexSet<ResolvedVc<Box<dyn Module>>> = FxIndexSet::default();

    for module_graph_vc in module_graphs {
        let module_graph = module_graph_vc.await?;
        let classified = classify_module_graph_edges(&module_graph)?;

        let entries: Vec<_> = module_graph.all_entry_modules().collect();
        let static_edges: Vec<_> = classified.static_edges.iter().copied().collect();
        let graph_reachable = compute_static_reachable(&entries, &static_edges);
        static_reachable.extend(graph_reachable);

        traced_modules.extend(classified.traced_modules.iter().copied());
        all_modules.extend(classified.modules.iter().copied());
    }

    // Resolve each module's source path up front so the aggregator closure stays
    // synchronous.
    let mut module_to_source: FxHashMap<ResolvedVc<Box<dyn Module>>, u32> = FxHashMap::default();
    for module in &all_modules {
        let path = module.ident().await?.path.to_string_ref().await?;
        if let Some(&source_index) = source_index_map.get(&*path) {
            module_to_source.insert(*module, source_index);
        }
    }

    Ok(aggregate_async_only_sources(
        all_modules.iter().copied(),
        &static_reachable,
        &traced_modules,
        |module| module_to_source.get(module).copied(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hs<T: Copy + Eq + std::hash::Hash>(items: &[T]) -> FxHashSet<T> {
        items.iter().copied().collect()
    }

    /// Smoke test: BFS reaches transitively-static-imported modules but not
    /// async-imported ones.
    #[test]
    fn static_reachable_basic() {
        // entry -> a (static) -> b (static); entry -> c (async, NOT a static edge)
        let entries = [0u32];
        let static_edges = [(0, 1), (1, 2)];
        let reachable = compute_static_reachable(&entries, &static_edges);
        assert_eq!(reachable, hs(&[0, 1, 2]));
    }

    #[test]
    fn static_reachable_handles_cycles() {
        let entries = [0u32];
        // 0 -> 1 -> 2 -> 0 (cycle)
        let static_edges = [(0, 1), (1, 2), (2, 0)];
        let reachable = compute_static_reachable(&entries, &static_edges);
        assert_eq!(reachable, hs(&[0, 1, 2]));
    }

    #[test]
    fn static_reachable_skips_unreachable() {
        let entries = [0u32];
        // 0 -> 1; orphan: 2 -> 3
        let static_edges = [(0, 1), (2, 3)];
        let reachable = compute_static_reachable(&entries, &static_edges);
        assert_eq!(reachable, hs(&[0, 1]));
    }

    /// A module that's only async-reachable yields its source as async-only.
    #[test]
    fn async_only_basic() {
        // module 0 is the entry (static), module 1 is async-only
        let static_reachable = hs(&[0u32]);
        let traced = hs::<u32>(&[]);
        let module_to_source: FxHashMap<u32, u32> = [(0, 100), (1, 101)].into_iter().collect();

        let result = aggregate_async_only_sources([0, 1], &static_reachable, &traced, |m| {
            module_to_source.get(m).copied()
        });

        assert_eq!(result, hs(&[101]));
    }

    /// Regression test for the multi-variant bug: a single source path can map
    /// to multiple module instances (e.g. client vs ssr layer variants). If
    /// any variant is static-reachable, the source must NOT be marked
    /// async-only — even though the other variants are async-only.
    ///
    /// In the example: source `head.js` has two module variants (ssr layer +
    /// client layer). The ssr variant is statically imported via
    /// `image-component.js`; the client variant is only reachable via async
    /// chunks. The source must not be marked async-only.
    #[test]
    fn async_only_source_with_mixed_variants_is_not_async_only() {
        // modules 0,1 = ssr variant of head.js, client variant of head.js
        // module 2 = unrelated async-only module
        let static_reachable = hs(&[0u32]); // ssr variant is statically reached
        let traced = hs::<u32>(&[]);
        let head_source = 100u32;
        let other_source = 101u32;
        let module_to_source: FxHashMap<u32, u32> = [
            (0, head_source), // ssr variant -> head.js source
            (1, head_source), // client variant -> SAME head.js source
            (2, other_source),
        ]
        .into_iter()
        .collect();

        let result = aggregate_async_only_sources([0, 1, 2], &static_reachable, &traced, |m| {
            module_to_source.get(m).copied()
        });

        // head.js is NOT async-only because one of its variants is
        // static-reachable. Only the unrelated source is async-only.
        assert_eq!(result, hs(&[other_source]));
    }

    /// Symmetric case: if ALL variants of a source are async-only, the source
    /// IS async-only.
    #[test]
    fn async_only_source_when_all_variants_async_only() {
        // Both module variants 0 and 1 map to the same source and neither is
        // static-reachable or traced.
        let static_reachable = hs::<u32>(&[]);
        let traced = hs::<u32>(&[]);
        let shared_source = 100u32;
        let module_to_source: FxHashMap<u32, u32> = [(0, shared_source), (1, shared_source)]
            .into_iter()
            .collect();

        let result = aggregate_async_only_sources([0, 1], &static_reachable, &traced, |m| {
            module_to_source.get(m).copied()
        });

        assert_eq!(result, hs(&[shared_source]));
    }

    /// Traced modules are not async-only (traced is a separate category).
    #[test]
    fn traced_modules_excluded_from_async_only() {
        let static_reachable = hs::<u32>(&[]);
        let traced = hs(&[0u32]);
        let module_to_source: FxHashMap<u32, u32> = [(0, 100)].into_iter().collect();

        let result = aggregate_async_only_sources([0], &static_reachable, &traced, |m| {
            module_to_source.get(m).copied()
        });

        assert!(result.is_empty());
    }

    /// Mixed traced+async variants: if any variant is traced, the source is
    /// not async-only.
    #[test]
    fn traced_variant_disqualifies_source() {
        let static_reachable = hs::<u32>(&[]);
        let traced = hs(&[0u32]); // first variant is traced
        let shared_source = 100u32;
        let module_to_source: FxHashMap<u32, u32> = [(0, shared_source), (1, shared_source)]
            .into_iter()
            .collect();

        let result = aggregate_async_only_sources([0, 1], &static_reachable, &traced, |m| {
            module_to_source.get(m).copied()
        });

        assert!(result.is_empty());
    }

    /// Modules with no source mapping (e.g. runtime-injected modules) are
    /// silently skipped and don't produce phantom source entries.
    #[test]
    fn modules_without_source_are_skipped() {
        let static_reachable = hs::<u32>(&[]);
        let traced = hs::<u32>(&[]);
        // Module 0 has no source mapping; module 1 does.
        let module_to_source: FxHashMap<u32, u32> = [(1, 100)].into_iter().collect();

        let result = aggregate_async_only_sources([0, 1], &static_reachable, &traced, |m| {
            module_to_source.get(m).copied()
        });

        assert_eq!(result, hs(&[100]));
    }
}

#[turbo_tasks::function]
pub async fn analyze_output_assets(
    output_assets: Vc<OutputAssets>,
    traced_files: Vc<FileSystemPathVec>,
    module_graphs: Vc<ModuleGraphs>,
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

    let async_only_sources = compute_async_only_sources(
        module_graphs.await?.iter().copied().collect(),
        &builder.source_index_map,
    )
    .await?;
    builder.set_async_only_sources(async_only_sources);

    let rope = builder.build();
    Ok(FileContent::Content(File::from(rope)).cell())
}

#[turbo_tasks::function]
pub async fn analyze_module_graphs(module_graph: Vc<ModuleGraph>) -> Result<Vc<FileContent>> {
    let mut builder = ModulesDataBuilder::new();

    let module_graph = module_graph.await?;
    let classified = classify_module_graph_edges(&module_graph)?;

    let all_modules = classified.modules;
    let all_edges = classified.static_edges;
    let all_async_edges = classified.async_edges;
    let all_traced_edges = classified.traced_edges;

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
    pub module_graphs: ResolvedVc<ModuleGraphs>,
}

#[turbo_tasks::value_impl]
impl AnalyzeDataOutputAsset {
    #[turbo_tasks::function]
    pub async fn new(
        path: FileSystemPath,
        output_assets: ResolvedVc<OutputAssets>,
        traced_files: ResolvedVc<FileSystemPathVec>,
        module_graphs: ResolvedVc<ModuleGraphs>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            path,
            output_assets,
            traced_files,
            module_graphs,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for AnalyzeDataOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        let file_content =
            analyze_output_assets(*self.output_assets, *self.traced_files, *self.module_graphs);
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
