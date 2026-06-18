use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkingContext, EntryChunkGroupResult, availability_info::AvailabilityInfo},
    context::AssetContext,
    file_source::FileSource,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module::Module,
    module_graph::{
        ModuleGraph, SingleModuleGraph,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry, EntryHeuristics},
    },
    output::{OutputAsset, OutputAssets},
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
};
use turbopack_ecmascript::references::service_worker::{
    ServiceWorkerEntryModule, service_worker_chunk_filename,
};

use crate::project::Project;

/// Discovers every `navigator.serviceWorker.register(new URL(...), { scope })` registration
/// reachable from `module_graph` — via the [`ServiceWorkerEntryModule`] markers the analyzer leaves
/// in the graph — and compiles each registered worker into a single self-contained bundle.
///
/// Each is emitted under `node_root/service-worker/<scope-derived name>` (e.g.
/// `service-worker/sw.js`, `service-worker/sw-offline-mode.js`) and served at the matching
/// origin-root URL (`/sw.js`, `/sw-offline-mode.js`).
///
/// Only one service worker is supported per scope.
#[turbo_tasks::function]
pub async fn service_worker_output_assets(
    project: Vc<Project>,
    module_graph: Vc<ModuleGraph>,
) -> Result<Vc<OutputAssets>> {
    let mut by_scope: FxIndexMap<RcStr, FxIndexSet<FileSystemPath>> = FxIndexMap::default();
    for layer in module_graph.iter_graphs().await?.iter() {
        let layer = layer.connect();
        for module in layer.await?.iter_reachable_modules()? {
            if let Some(marker) = ResolvedVc::try_downcast_type::<ServiceWorkerEntryModule>(module)
            {
                let marker = marker.await?;
                let path = marker.inner.ident().await?.path.clone();
                by_scope
                    .entry(marker.scope.clone())
                    .or_default()
                    .insert(path);
            }
        }
    }

    let mut assets: Vec<ResolvedVc<Box<dyn OutputAsset>>> = vec![];
    for (scope, sources) in by_scope {
        match sources.len() {
            0 => {}
            1 => {
                let source = sources.into_iter().next().unwrap();
                assets.push(
                    service_worker_chunk(project, scope, source)
                        .to_resolved()
                        .await?,
                );
            }
            _ => {
                let file_path = sources.iter().next().unwrap().clone();
                let mut files = sources
                    .iter()
                    .map(|path| path.path.clone())
                    .collect::<Vec<_>>();
                files.sort();
                ConflictingServiceWorkersIssue {
                    scope,
                    files,
                    file_path,
                }
                .resolved_cell()
                .emit();
            }
        }
    }

    Ok(Vc::cell(assets))
}

/// Compiles a single service worker `source_path` (registered at `scope`) into one self-contained
/// chunk emitted at `node_root/service-worker/<scope-derived name>`.
#[turbo_tasks::function]
async fn service_worker_chunk(
    project: Vc<Project>,
    scope: RcStr,
    source_path: FileSystemPath,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    let asset_context = project.service_worker_asset_context();
    let chunking_context = project.service_worker_chunking_context();
    let node_root = project.node_root().owned().await?;
    let is_production = project.next_mode().await?.is_production();
    let filename = service_worker_chunk_filename(&scope);

    let source: Vc<Box<dyn Source>> = Vc::upcast(FileSource::new(source_path));
    let module = asset_context
        .process(source, ReferenceType::Entry(EntryReferenceSubType::Web))
        .module()
        .to_resolved()
        .await?;

    let own_graph = ModuleGraph::from_graphs(
        vec![SingleModuleGraph::new_with_entry(
            ChunkGroupEntry::Entry {
                modules: vec![module],
                heuristics: EntryHeuristics::default(),
            },
            /* include_traced */ *project.should_write_nft_manifests().await?,
            /* include_binding_usage */ is_production,
        )],
        /* binding_usage */ None,
    )
    .connect();

    let EntryChunkGroupResult { asset, .. } = *chunking_context
        .entry_chunk_group(
            node_root.join("service-worker")?.join(&filename)?,
            ChunkGroup::Entry(vec![module]),
            own_graph,
            /* extra_chunks */ OutputAssets::empty(),
            /* extra_referenced_chunks */ OutputAssets::empty(),
            AvailabilityInfo::root(),
        )
        .await?;
    Ok(*asset)
}

/// Emitted when more than one service worker, with differing source files, is registered for the
/// same scope. Each scope can only serve a single service worker.
#[turbo_tasks::value(shared)]
struct ConflictingServiceWorkersIssue {
    scope: RcStr,
    files: Vec<RcStr>,
    file_path: FileSystemPath,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ConflictingServiceWorkersIssue {
    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Multiple service workers registered for the same scope."
        )))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Stack(vec![
            StyledString::Text(
                format!(
                    "Multiple service workers with different source files were registered for \
                     scope '{}'. Each scope serves a single service worker.",
                    self.scope
                )
                .into(),
            ),
            StyledString::Line(vec![
                StyledString::Text(rcstr!("Registered source files: ")),
                StyledString::Code(self.files.join(", ").into()),
            ]),
        ])))
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::ProcessModule
    }
}
