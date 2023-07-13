use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::ChunkingContext,
    ident::AssetIdentVc,
    introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc},
    output::{OutputAsset, OutputAssetVc},
    reference::AssetReferencesVc,
    source_map::{
        GenerateSourceMap, GenerateSourceMapVc, OptionSourceMapVc, SourceMapAssetReferenceVc,
    },
};
use turbopack_ecmascript::chunk::EcmascriptChunkVc;

use super::content::EcmascriptBuildNodeChunkContentVc;
use crate::BuildChunkingContextVc;

/// Production Ecmascript chunk targeting Node.js.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptBuildNodeChunk {
    chunking_context: BuildChunkingContextVc,
    chunk: EcmascriptChunkVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkVc {
    /// Creates a new [`EcmascriptBuildNodeChunkVc`].
    #[turbo_tasks::function]
    pub fn new(chunking_context: BuildChunkingContextVc, chunk: EcmascriptChunkVc) -> Self {
        EcmascriptBuildNodeChunk {
            chunking_context,
            chunk,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell("Ecmascript Build Node Chunk".to_string()))
    }
}

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("ecmascript build node chunk".to_string())
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkVc {
    #[turbo_tasks::function]
    async fn own_content(self) -> Result<EcmascriptBuildNodeChunkContentVc> {
        let this = self.await?;
        Ok(EcmascriptBuildNodeChunkContentVc::new(
            this.chunking_context,
            self,
            this.chunk.chunk_content(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBuildNodeChunk {}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        let ident = self.chunk.ident().with_modifier(modifier());
        AssetIdentVc::from_path(self.chunking_context.chunk_path(ident, ".js"))
    }

    #[turbo_tasks::function]
    async fn references(self_vc: EcmascriptBuildNodeChunkVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let chunk_references = this.chunk.references().await?;
        let mut references = Vec::with_capacity(chunk_references.len() + 1);

        for reference in &*chunk_references {
            references.push(*reference);
        }

        if *this
            .chunking_context
            .reference_chunk_source_maps(self_vc.into())
            .await?
        {
            references.push(SourceMapAssetReferenceVc::new(self_vc.into()).into());
        }

        Ok(AssetReferencesVc::cell(references))
    }

    #[turbo_tasks::function]
    fn content(self_vc: EcmascriptBuildNodeChunkVc) -> AssetContentVc {
        self_vc.own_content().content()
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: EcmascriptBuildNodeChunkVc) -> OptionSourceMapVc {
        self_vc.own_content().generate_source_map()
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("ecmascript build node chunk".to_string())
}

#[turbo_tasks::function]
fn introspectable_details() -> StringVc {
    StringVc::cell("generates a production EcmaScript chunk targeting Node.js".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self_vc: EcmascriptBuildNodeChunkVc) -> StringVc {
        self_vc.ident().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> StringVc {
        introspectable_details()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        let mut children = IndexSet::new();
        if let Some(chunk) = IntrospectableVc::resolve_from(self.chunk).await? {
            children.insert((StringVc::cell("chunk".to_string()), chunk));
        }
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
