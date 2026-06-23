use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkData, ChunkingContext, ChunksData, EvaluatableAssets, MinifyType, ModuleChunkItemIdExt,
    },
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::{GenerateSourceMap, SourceMapAsset},
};
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceable, minify::minify, utils::StringifyJs};

use crate::NodeJsChunkingContext;

/// An Ecmascript chunk that:
/// * Contains the Turbopack browser runtime code; and
/// * Evaluates a list of runtime entries.
#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("Ecmascript Node Evaluate Chunk")]
pub(crate) struct EcmascriptBuildNodeEvaluatedChunk {
    chunking_context: ResolvedVc<NodeJsChunkingContext>,
    ident: ResolvedVc<AssetIdent>,
    other_chunks: ResolvedVc<OutputAssets>,
    evaluatable_assets: ResolvedVc<EvaluatableAssets>,
    // TODO(sokra): It's weird to use ModuleGraph here, we should convert evaluatable_assets to a
    // list of chunk items before passing it to this struct
    module_graph: ResolvedVc<ModuleGraph>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeEvaluatedChunk {
    /// Creates a new [`Vc<EcmascriptBuildNodeEvaluatedChunk>`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        ident: ResolvedVc<AssetIdent>,
        other_chunks: ResolvedVc<OutputAssets>,
        evaluatable_assets: ResolvedVc<EvaluatableAssets>,
        module_graph: ResolvedVc<ModuleGraph>,
    ) -> Vc<Self> {
        EcmascriptBuildNodeEvaluatedChunk {
            chunking_context,
            ident,
            other_chunks,
            evaluatable_assets,
            module_graph,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn chunks_data(&self) -> Result<Vc<ChunksData>> {
        Ok(ChunkData::from_assets(
            self.chunking_context.output_root().owned().await?,
            *self.other_chunks,
        ))
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;
        let source_maps = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;

        let runtime_module_ids = this
            .evaluatable_assets
            .await?
            .iter()
            .map({
                let chunking_context = this.chunking_context;
                move |entry| async move {
                    if let Some(placeable) =
                        ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*entry)
                    {
                        Ok(Some(
                            placeable
                                .chunk_item_id(Vc::upcast(*chunking_context))
                                .await?,
                        ))
                    } else {
                        Ok(None)
                    }
                }
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();

        let mut code = CodeBuilder::new(
            source_maps,
            *this.chunking_context.debug_ids_enabled().await?,
        );

        // Use the configured chunk loading global variable to store the chunk here.
        // This allows multiple runtimes to coexist on the same page when using different global
        // names.
        writedoc!(
            code,
            // `||=` would be better but we need to be es2020 compatible
            //`x || (x = default)` is better than `x = x || default` simply because we avoid _writing_ the property in the common case.
            r#"
                {params}.forEach(function(id){{
                    globalThis.TURBOPACK_INSTANTIATE_RUNTIME_MODULE(id)
                }});
            "#,
            params = StringifyJs(&runtime_module_ids),
        )?;

        let mut code = code.build();

        if let MinifyType::Minify { mangle } = *this.chunking_context.minify_type().await? {
            code = minify(code, source_maps, mangle)?;
        }

        Ok(code.cell())
    }

    #[turbo_tasks::function]
    async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = self
            .ident
            .owned()
            .await?
            .with_modifier(rcstr!("ecmascript browser evaluate chunk"));

        let evaluatable_assets = self.evaluatable_assets.await?;
        ident.modifiers.extend(
            evaluatable_assets
                .iter()
                .map(|entry| entry.ident().to_string().owned())
                .try_join()
                .await?,
        );
        ident.modifiers.extend(
            self.other_chunks
                .await?
                .iter()
                .map(|chunk| chunk.path().to_string().owned())
                .try_join()
                .await?,
        );

        Ok(ident.into_vc())
    }

    #[turbo_tasks::function]
    async fn source_map(self: Vc<Self>) -> Result<Vc<SourceMapAsset>> {
        let this = self.await?;
        Ok(SourceMapAsset::new(
            Vc::upcast(*this.chunking_context),
            self.ident_for_path(),
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for EcmascriptBuildNodeEvaluatedChunk {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        let mut references = Vec::new();

        let include_source_map = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;

        if include_source_map {
            references.push(ResolvedVc::upcast(self.source_map().to_resolved().await?));
        }

        references.extend(this.other_chunks.await?.iter().copied());

        Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(
            references,
        )))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBuildNodeEvaluatedChunk {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = self.ident_for_path();
        Ok(this.chunking_context.chunk_path(
            Some(Vc::upcast(self)),
            ident,
            Some(rcstr!("turbopack")),
            rcstr!(".js"),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBuildNodeEvaluatedChunk {
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
impl GenerateSourceMap for EcmascriptBuildNodeEvaluatedChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}
