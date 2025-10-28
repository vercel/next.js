use std::io::Write;

use anyhow::{Result, bail};
use indoc::writedoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystem, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    output::{OutputAsset, OutputAssets},
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap, SourceMapAsset},
};
use turbopack_ecmascript::utils::StringifyJs;
use turbopack_ecmascript_runtime::RuntimeType;

use crate::NodeJsChunkingContext;

/// An Ecmascript chunk that contains the Node.js runtime code.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptBuildNodeRuntimeChunk {
    chunking_context: ResolvedVc<NodeJsChunkingContext>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeRuntimeChunk {
    /// Creates a new [`Vc<EcmascriptBuildNodeRuntimeChunk>`].
    #[turbo_tasks::function]
    pub fn new(chunking_context: ResolvedVc<NodeJsChunkingContext>) -> Vc<Self> {
        EcmascriptBuildNodeRuntimeChunk { chunking_context }.cell()
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;

        let output_root_to_root_path = this.chunking_context.output_root_to_root_path().await?;
        let output_root = this.chunking_context.output_root().await?;
        let generate_source_map = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;
        let runtime_path = self.path().await?;
        let runtime_public_path = if let Some(path) = output_root.get_path_to(&runtime_path) {
            path
        } else {
            bail!(
                "runtime path {} is not in output root {}",
                runtime_path.to_string(),
                output_root.to_string()
            );
        };

        let mut code = CodeBuilder::default();
        let asset_prefix = this.chunking_context.asset_prefix().await?;
        let asset_prefix = asset_prefix.as_deref().unwrap_or("/");

        writedoc!(
            code,
            r#"
                const RUNTIME_PUBLIC_PATH = {};
                const RELATIVE_ROOT_PATH = {};
                const ASSET_PREFIX = {};
            "#,
            StringifyJs(runtime_public_path),
            StringifyJs(output_root_to_root_path.as_str()),
            StringifyJs(asset_prefix),
        )?;

        match *this.chunking_context.runtime_type().await? {
            RuntimeType::Development => {
                let runtime_code = turbopack_ecmascript_runtime::get_nodejs_runtime_code(
                    this.chunking_context.environment(),
                    generate_source_map,
                );
                code.push_code(&*runtime_code.await?);
            }
            RuntimeType::Production => {
                let runtime_code = turbopack_ecmascript_runtime::get_nodejs_runtime_code(
                    this.chunking_context.environment(),
                    generate_source_map,
                );
                code.push_code(&*runtime_code.await?);
            }
            #[cfg(feature = "test")]
            RuntimeType::Dummy => {
                let runtime_code = turbopack_ecmascript_runtime::get_dummy_runtime_code();
                code.push_code(&runtime_code);
            }
        }

        Ok(Code::cell(code.build()))
    }

    #[turbo_tasks::function]
    async fn ident_for_path(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        Ok(AssetIdent::from_path(
            turbopack_ecmascript_runtime::embed_fs()
                .root()
                .await?
                .join("runtime.js")?,
        ))
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
impl ValueToString for EcmascriptBuildNodeRuntimeChunk {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("Ecmascript Build Node Runtime Chunk"))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBuildNodeRuntimeChunk {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = self.ident_for_path();

        Ok(this
            .chunking_context
            .chunk_path(Some(Vc::upcast(self)), ident, None, rcstr!(".js")))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let mut references = vec![];

        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
        {
            references.push(ResolvedVc::upcast(self.source_map().to_resolved().await?))
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBuildNodeRuntimeChunk {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        Ok(AssetContent::file(
            File::from(
                self.code()
                    .to_rope_with_magic_comments(|| self.source_map())
                    .await?,
            )
            .into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeRuntimeChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionStringifiedSourceMap> {
        self.code().generate_source_map()
    }
}
