use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{RcStr, ValueToString, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkingContext},
    ident::AssetIdent,
    introspect::{Introspectable, IntrospectableChildren},
    output::{OutputAsset, OutputAssets},
    source_map::{GenerateSourceMap, OptionSourceMap, SourceMapAsset},
    version::VersionedContent,
};
use turbopack_ecmascript::chunk::EcmascriptChunk;

use super::content::EcmascriptBuildNodeChunkContent;
use crate::NodeJsChunkingContext;

/// Production Ecmascript chunk targeting Node.js.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptBuildNodeChunk {
    chunking_context: Vc<NodeJsChunkingContext>,
    chunk: Vc<EcmascriptChunk>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunk {
    /// Creates a new [`Vc<EcmascriptBuildNodeChunk>`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: Vc<NodeJsChunkingContext>,
        chunk: Vc<EcmascriptChunk>,
    ) -> Vc<Self> {
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
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell("Ecmascript Build Node Chunk".into()))
    }
}

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("ecmascript build node chunk".into())
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    async fn own_content(self: Vc<Self>) -> Result<Vc<EcmascriptBuildNodeChunkContent>> {
        let this = self.await?;
        Ok(EcmascriptBuildNodeChunkContent::new(
            this.chunking_context,
            self,
            this.chunk.chunk_content(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        let ident = self.chunk.ident().with_modifier(modifier());
        AssetIdent::from_path(self.chunking_context.chunk_path(ident, ".js".into()))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let chunk_references = this.chunk.references().await?;
        let include_source_map = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;
        let mut references =
            Vec::with_capacity(chunk_references.len() + if include_source_map { 1 } else { 0 });

        for reference in &*chunk_references {
            references.push(*reference);
        }

        if include_source_map {
            references.push(Vc::upcast(SourceMapAsset::new(Vc::upcast(self))));
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        self.own_content().content()
    }

    #[turbo_tasks::function]
    fn versioned_content(self: Vc<Self>) -> Vc<Box<dyn VersionedContent>> {
        Vc::upcast(self.own_content())
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionSourceMap> {
        self.own_content().generate_source_map()
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("ecmascript build node chunk".into())
}

#[turbo_tasks::function]
fn introspectable_details() -> Vc<RcStr> {
    Vc::cell("generates a production EcmaScript chunk targeting Node.js".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        self.ident().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        introspectable_details()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let mut children = IndexSet::new();
        let introspectable_chunk = Vc::upcast::<Box<dyn Introspectable>>(self.chunk)
            .resolve()
            .await?;
        children.insert((Vc::cell("chunk".into()), introspectable_chunk));
        Ok(Vc::cell(children))
    }
}
