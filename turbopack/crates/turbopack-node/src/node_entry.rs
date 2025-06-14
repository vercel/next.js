use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::chunk::{ChunkingContext, EvaluatableAsset, EvaluatableAssets};
use turbopack_dev_server::source::ContentSourceData;

#[turbo_tasks::value(shared)]
pub struct NodeRenderingEntry {
    pub runtime_entries: ResolvedVc<EvaluatableAssets>,
    pub module: ResolvedVc<Box<dyn EvaluatableAsset>>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub intermediate_output_path: ResolvedVc<FileSystemPath>,
    pub output_root: ResolvedVc<FileSystemPath>,
    pub project_dir: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value(transparent)]
pub struct NodeRenderingEntries(Vec<ResolvedVc<NodeRenderingEntry>>);

/// Trait that allows to get the entry module for rendering something in Node.js
#[turbo_tasks::value_trait]
pub trait NodeEntry {
    #[turbo_tasks::function]
    fn entry(self: Vc<Self>, data: ContentSourceData) -> Vc<NodeRenderingEntry>;

    #[turbo_tasks::function]
    async fn entries(self: Vc<Self>) -> Result<Vc<NodeRenderingEntries>> {
        Ok(Vc::cell(vec![
            self.entry(Default::default()).to_resolved().await?,
        ]))
    }
}
