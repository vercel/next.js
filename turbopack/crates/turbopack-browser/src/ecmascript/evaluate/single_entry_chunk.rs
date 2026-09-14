use anyhow::Result;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkingContext, EvaluatableAssets},
    code_builder::{Code, CodeBuilder},
    module_graph::ModuleGraph,
    output::{
        OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsReferences,
        OutputAssetsWithReferenced,
    },
    source_map::{GenerateSourceMap, SourceMapAsset},
};
use turbopack_ecmascript::chunk::EcmascriptChunk;

use crate::{
    BrowserChunkingContext,
    ecmascript::{chunk::EcmascriptBrowserChunk, evaluate::chunk::EcmascriptBrowserEvaluateChunk},
};

/// A self-contained chunk that inlines the entire module together with
/// the Turbopack browser runtime and the evaluation of the entry modules.
///
/// Unlike the regular evaluate chunk, this emits everything into one file at a
/// fixed path and never loads additional chunks at runtime.
#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("Ecmascript Browser Single Entry Chunk")]
pub(crate) struct EcmascriptBrowserSingleEntryChunk {
    chunking_context: ResolvedVc<BrowserChunkingContext>,
    path: FileSystemPath,
    chunk: ResolvedVc<EcmascriptChunk>,
    evaluatable_assets: ResolvedVc<EvaluatableAssets>,
    referenced_output_assets: ResolvedVc<OutputAssets>,
    references: ResolvedVc<OutputAssetsReferences>,
    module_graph: ResolvedVc<ModuleGraph>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserSingleEntryChunk {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<BrowserChunkingContext>,
        path: FileSystemPath,
        chunk: ResolvedVc<EcmascriptChunk>,
        evaluatable_assets: ResolvedVc<EvaluatableAssets>,
        referenced_output_assets: ResolvedVc<OutputAssets>,
        references: ResolvedVc<OutputAssetsReferences>,
        module_graph: ResolvedVc<ModuleGraph>,
    ) -> Vc<Self> {
        EcmascriptBrowserSingleEntryChunk {
            chunking_context,
            path,
            chunk,
            evaluatable_assets,
            referenced_output_assets,
            references,
            module_graph,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;

        let source_maps = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;
        let mut code = CodeBuilder::new(
            source_maps,
            *this.chunking_context.debug_ids_enabled().await?,
        );

        let module_chunk = EcmascriptBrowserChunk::new(*this.chunking_context, *this.chunk);
        code.push_code(&*module_chunk.own_content().code().await?);

        let evaluate_chunk = EcmascriptBrowserEvaluateChunk::new(
            *this.chunking_context,
            this.chunk.ident(),
            OutputAssets::empty(),
            *this.evaluatable_assets,
            *this.module_graph,
        );
        code.push_code(&*evaluate_chunk.code().await?);

        // Append the shared runtime chunk; without `shared_runtime` it's already inlined above.
        if *this.chunking_context.shared_runtime().await? {
            let runtime_chunk = this
                .chunking_context
                .generate_runtime_chunk(*this.module_graph)
                .await?;
            code.push_code(&*runtime_chunk.code().await?);
        }

        Ok(Code::cell(code.build()))
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
impl OutputAssetsReference for EcmascriptBrowserSingleEntryChunk {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        let mut assets = Vec::new();

        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
        {
            assets.push(ResolvedVc::upcast(self.source_map().to_resolved().await?));
        }

        Ok(OutputAssetsWithReferenced {
            assets: ResolvedVc::cell(assets),
            referenced_assets: this.referenced_output_assets,
            references: this.references,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBrowserSingleEntryChunk {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBrowserSingleEntryChunk {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        Ok(AssetContent::file(
            FileContent::Content(File::from(
                self.code()
                    .to_rope_with_magic_comments(|| self.source_map())
                    .await?,
            ))
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBrowserSingleEntryChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}
