use std::io::Write;

use anyhow::{bail, Result};
use indoc::writedoc;
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystem};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    output::OutputAsset,
    reference::{AssetReference, AssetReferences},
    resolve::ResolveResult,
    source_map::{GenerateSourceMap, OptionSourceMap, SourceMapAssetReference},
};
use turbopack_ecmascript::utils::StringifyJs;
use turbopack_ecmascript_runtime::RuntimeType;

use crate::BuildChunkingContext;

/// An Ecmascript chunk that contains the Node.js runtime code.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptBuildNodeRuntimeChunk {
    chunking_context: Vc<BuildChunkingContext>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeRuntimeChunk {
    /// Creates a new [`Vc<EcmascriptBuildNodeRuntimeChunk>`].
    #[turbo_tasks::function]
    pub fn new(chunking_context: Vc<BuildChunkingContext>) -> Vc<Self> {
        EcmascriptBuildNodeRuntimeChunk { chunking_context }.cell()
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;

        let output_root = this.chunking_context.output_root().await?;
        let runtime_path = self.ident().path().await?;
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

        writedoc!(
            code,
            r#"
                const RUNTIME_PUBLIC_PATH = {};
            "#,
            StringifyJs(runtime_public_path)
        )?;

        match this.chunking_context.await?.runtime_type() {
            RuntimeType::Default => {
                let runtime_code = turbopack_ecmascript_runtime::get_build_runtime_code(
                    this.chunking_context.environment(),
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
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptBuildNodeRuntimeChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell("Ecmascript Build Node Runtime Chunk".to_string()))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBuildNodeRuntimeChunk {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        let ident = AssetIdent::from_path(
            turbopack_ecmascript_runtime::embed_fs()
                .root()
                .join("runtime.js".to_string()),
        );

        AssetIdent::from_path(self.chunking_context.chunk_path(ident, ".js".to_string()))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<AssetReferences>> {
        let this = self.await?;
        let mut references = vec![];

        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
        {
            references.push(Vc::upcast(SourceMapAssetReference::new(Vc::upcast(self))))
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBuildNodeRuntimeChunk {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;
        Ok(AssetContent::file(
            File::from(code.source_code().clone()).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeRuntimeChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionSourceMap> {
        self.code().generate_source_map()
    }
}

/// A reference to the runtime chunk.
#[turbo_tasks::value]
pub(crate) struct EcmascriptBuildNodeRuntimeReference {
    chunking_context: Vc<BuildChunkingContext>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeRuntimeReference {
    #[turbo_tasks::function]
    pub fn new(chunking_context: Vc<BuildChunkingContext>) -> Vc<Self> {
        Self::cell(EcmascriptBuildNodeRuntimeReference { chunking_context })
    }

    #[turbo_tasks::function]
    pub async fn runtime_chunk(self: Vc<Self>) -> Result<Vc<EcmascriptBuildNodeRuntimeChunk>> {
        Ok(EcmascriptBuildNodeRuntimeChunk::new(
            self.await?.chunking_context,
        ))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for EcmascriptBuildNodeRuntimeReference {
    #[turbo_tasks::function]
    fn resolve_reference(self: Vc<Self>) -> Vc<ResolveResult> {
        ResolveResult::asset(Vc::upcast(self.runtime_chunk())).into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptBuildNodeRuntimeReference {
    #[turbo_tasks::function]
    async fn to_string(self: Vc<Self>) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "runtime chunk {}",
            self.runtime_chunk().ident().to_string().await?
        )))
    }
}
