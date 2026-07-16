use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystem, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, MinifyType},
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::{GenerateSourceMap, SourceMapAsset},
};
use turbopack_ecmascript::minify::minify;
use turbopack_ecmascript_runtime::RuntimeType;

use crate::BrowserChunkingContext;

/// An Ecmascript chunk that contains the Turbopack browser runtime code.
///
/// This is emitted once per [`BrowserChunkingContext`] (deduplicated by
/// turbo-tasks on its inputs) and shared by every entrypoint, instead of being
/// inlined into each [`crate::ecmascript::evaluate::chunk::EcmascriptBrowserEvaluateChunk`]. It
/// mirrors the Node.js `turbopack_nodejs`'s `EcmascriptBuildNodeRuntimeChunk`.
#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("Ecmascript Browser Runtime Chunk")]
pub(crate) struct EcmascriptBrowserRuntimeChunk {
    chunking_context: ResolvedVc<BrowserChunkingContext>,
    has_async_modules: bool,
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserRuntimeChunk {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<BrowserChunkingContext>,
        has_async_modules: bool,
    ) -> Vc<Self> {
        EcmascriptBrowserRuntimeChunk {
            chunking_context,
            has_async_modules,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub(crate) async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;
        let chunking_context = this.chunking_context;
        let environment = chunking_context.environment();

        let output_root_to_root_path = chunking_context.output_root_to_root_path().owned().await?;
        let source_maps = *chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;
        let asset_context = turbopack::get_runtime_asset_context(environment);
        let runtime_type = *chunking_context.runtime_type().await?;

        let mut code = CodeBuilder::new(source_maps, *chunking_context.debug_ids_enabled().await?);

        match runtime_type {
            RuntimeType::Production | RuntimeType::Development => {
                let runtime_code = turbopack_ecmascript_runtime::get_browser_runtime_code(
                    asset_context,
                    chunking_context.chunk_base_path(),
                    chunking_context.asset_suffix(),
                    runtime_type,
                    output_root_to_root_path,
                    source_maps,
                    chunking_context.chunk_loading_global(),
                    chunking_context.cross_origin(),
                    chunking_context.chunk_load_retry(),
                    this.has_async_modules,
                    chunking_context.chunk_loading(),
                    *chunking_context.generate_component_chunks().await?,
                );
                code.push_code(&*runtime_code.await?);
            }
            #[cfg(feature = "test")]
            RuntimeType::Dummy => {
                let runtime_code = turbopack_ecmascript_runtime::get_dummy_runtime_code();
                code.push_code(&runtime_code);
            }
        }

        let mut code = code.build();

        if let MinifyType::Minify { mangle } = *chunking_context.minify_type().await? {
            code = minify(code, source_maps, mangle)?;
        }

        Ok(code.cell())
    }

    #[turbo_tasks::function]
    async fn ident_for_path(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        Ok(AssetIdent::from_path(
            turbopack_ecmascript_runtime::embed_fs()
                .root()
                .await?
                .join("runtime.js")?,
        )
        .into_vc())
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
impl OutputAssetsReference for EcmascriptBrowserRuntimeChunk {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        let mut references = vec![];

        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
        {
            references.push(ResolvedVc::upcast(self.source_map().to_resolved().await?))
        }

        Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(
            references,
        )))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBrowserRuntimeChunk {
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
impl Asset for EcmascriptBrowserRuntimeChunk {
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
impl GenerateSourceMap for EcmascriptBrowserRuntimeChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}
