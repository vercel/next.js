use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, EvaluatableAssets},
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::{GenerateSourceMap, SourceMapAsset},
};

use super::super::{
    chunk_utils::generate_node_chunk_bootstrap, entry::runtime::EcmascriptBuildNodeRuntimeChunk,
};
use crate::NodeJsChunkingContext;

/// An Ecmascript chunk that evaluates modules in an isolated context (for workers).
/// This is similar to EcmascriptBuildNodeEntryChunk but designed for worker threads
/// where the code is loaded in a fresh runtime context.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptBuildNodeEvaluateChunk {
    chunking_context: ResolvedVc<NodeJsChunkingContext>,
    ident: ResolvedVc<AssetIdent>,
    other_chunks: ResolvedVc<OutputAssets>,
    evaluatable_assets: ResolvedVc<EvaluatableAssets>,
    module_graph: ResolvedVc<ModuleGraph>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeEvaluateChunk {
    /// Creates a new [`Vc<EcmascriptBuildNodeEvaluateChunk>`].
    #[turbo_tasks::function]
    pub async fn new(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        ident: ResolvedVc<AssetIdent>,
        other_chunks: ResolvedVc<OutputAssets>,
        evaluatable_assets: ResolvedVc<EvaluatableAssets>,
        module_graph: ResolvedVc<ModuleGraph>,
    ) -> Result<Vc<Self>> {
        Ok(EcmascriptBuildNodeEvaluateChunk {
            chunking_context,
            ident,
            other_chunks,
            evaluatable_assets,
            module_graph,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        eprintln!(
            "generating an evaluate chunk: {}",
            self.await?.ident.to_string().await?
        );
        let this = self.await?;
        let chunk_path = self.path().owned().await?;
        let runtime_path = self.runtime_chunk().path().owned().await?;

        let mut code = CodeBuilder::default();

        generate_node_chunk_bootstrap(
            &mut code,
            this.chunking_context,
            &chunk_path,
            &runtime_path,
            this.other_chunks,
            this.evaluatable_assets,
        )
        .await?;

        Ok(Code::cell(code.build()))
    }

    #[turbo_tasks::function]
    fn runtime_chunk(&self) -> Vc<EcmascriptBuildNodeRuntimeChunk> {
        EcmascriptBuildNodeRuntimeChunk::new(*self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn source_map(self: Vc<Self>) -> Result<Vc<SourceMapAsset>> {
        let this = self.await?;
        let path = this
            .chunking_context
            .chunk_path(None, *this.ident, None, rcstr!(".js"))
            .await?;
        Ok(SourceMapAsset::new_fixed((*path).clone(), Vc::upcast(self)))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptBuildNodeEvaluateChunk {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("Ecmascript Build Node Evaluate Chunk"))
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for EcmascriptBuildNodeEvaluateChunk {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        let mut assets = vec![ResolvedVc::upcast(
            self.runtime_chunk().to_resolved().await?,
        )];

        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
        {
            assets.push(ResolvedVc::upcast(self.source_map().to_resolved().await?))
        }

        let other_chunks = this.other_chunks.await?;
        assets.extend(other_chunks.iter().copied());

        Ok(OutputAssetsWithReferenced::from_assets(*ResolvedVc::cell(
            assets,
        )))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBuildNodeEvaluateChunk {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        Ok(self
            .chunking_context
            .chunk_path(None, *self.ident, None, rcstr!(".js")))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBuildNodeEvaluateChunk {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;
        Ok(AssetContent::file(
            FileContent::Content(File::from(code.source_code().clone())).cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeEvaluateChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}
