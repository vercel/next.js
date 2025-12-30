use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, EvaluatableAssets, ModuleChunkItemIdExt},
    code_builder::{Code, CodeBuilder},
    module_graph::ModuleGraph,
    output::{
        OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsReferences,
        OutputAssetsWithReferenced,
    },
    source_map::{GenerateSourceMap, SourceMapAsset},
};
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceable, utils::StringifyJs};

use super::{
    super::chunk_utils::generate_node_chunk_bootstrap, runtime::EcmascriptBuildNodeRuntimeChunk,
};
use crate::NodeJsChunkingContext;

/// An Ecmascript chunk that loads a list of parallel chunks, then instantiates
/// runtime entries.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptBuildNodeEntryChunk {
    path: FileSystemPath,
    other_chunks: ResolvedVc<OutputAssets>,
    evaluatable_assets: ResolvedVc<EvaluatableAssets>,
    exported_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    referenced_output_assets: ResolvedVc<OutputAssets>,
    references: ResolvedVc<OutputAssetsReferences>,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<NodeJsChunkingContext>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeEntryChunk {
    /// Creates a new [`Vc<EcmascriptBuildNodeEntryChunk>`].
    #[turbo_tasks::function]
    pub fn new(
        path: FileSystemPath,
        other_chunks: ResolvedVc<OutputAssets>,
        evaluatable_assets: ResolvedVc<EvaluatableAssets>,
        exported_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        referenced_output_assets: ResolvedVc<OutputAssets>,
        references: ResolvedVc<OutputAssetsReferences>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
    ) -> Vc<Self> {
        EcmascriptBuildNodeEntryChunk {
            path,
            other_chunks,
            evaluatable_assets,
            exported_module,
            referenced_output_assets,
            references,
            module_graph,
            chunking_context,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;
        let chunk_path = self.path().owned().await?;
        let runtime_path = self.runtime_chunk().path().owned().await?;

        let mut code = CodeBuilder::default();

        // Generate the common bootstrap code (runtime + chunks + evaluatable assets)
        generate_node_chunk_bootstrap(
            &mut code,
            this.chunking_context,
            &chunk_path,
            &runtime_path,
            this.other_chunks,
            this.evaluatable_assets,
        )
        .await?;

        // Add the module export (entry chunks export the last module)
        let runtime_module_id = this
            .exported_module
            .chunk_item_id(Vc::upcast(*this.chunking_context))
            .await?;

        writedoc!(
            code,
            r#"
                module.exports=R.m({}).exports
            "#,
            StringifyJs(&*runtime_module_id),
        )?;

        Ok(Code::cell(code.build()))
    }

    #[turbo_tasks::function]
    fn runtime_chunk(&self) -> Vc<EcmascriptBuildNodeRuntimeChunk> {
        EcmascriptBuildNodeRuntimeChunk::new(*self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn source_map(self: Vc<Self>) -> Result<Vc<SourceMapAsset>> {
        let this = self.await?;
        Ok(SourceMapAsset::new_fixed(
            this.path.clone(),
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptBuildNodeEntryChunk {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("Ecmascript Build Node Entry Chunk"))
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for EcmascriptBuildNodeEntryChunk {
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

        Ok(OutputAssetsWithReferenced {
            assets: ResolvedVc::cell(assets),
            referenced_assets: this.referenced_output_assets,
            references: this.references,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBuildNodeEntryChunk {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBuildNodeEntryChunk {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;
        Ok(AssetContent::file(
            FileContent::Content(File::from(code.source_code().clone())).cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeEntryChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}
