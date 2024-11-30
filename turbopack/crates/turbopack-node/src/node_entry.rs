use anyhow::Result;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkingContext, EvaluatableAssets},
    module::Module,
};
use turbopack_dev_server::source::ContentSourceData;

#[turbo_tasks::value(shared)]
pub struct NodeRenderingEntry {
    pub runtime_entries: ResolvedVc<EvaluatableAssets>,
    pub module: ResolvedVc<Box<dyn Module>>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub intermediate_output_path: ResolvedVc<FileSystemPath>,
    pub output_root: ResolvedVc<FileSystemPath>,
    pub project_dir: ResolvedVc<FileSystemPath>,
}

// TODO(ResolvedVc): this struct seems to be trivially used in this trait which returns a Vc
//                   so perhaps it should remain a Vc?
#[turbo_tasks::value(transparent)]
pub struct NodeRenderingEntries(Vec<ResolvedVc<NodeRenderingEntry>>);

/// Trait that allows to get the entry module for rendering something in Node.js
#[turbo_tasks::value_trait]
pub trait NodeEntry {
    fn entry(self: Vc<Self>, data: Value<ContentSourceData>) -> Vc<NodeRenderingEntry>;
    async fn entries(self: Vc<Self>) -> Result<Vc<NodeRenderingEntries>> {
        Ok(Vc::cell(vec![
            self.entry(Value::new(Default::default()))
                .to_resolved()
                .await?,
        ]))
    }
}
