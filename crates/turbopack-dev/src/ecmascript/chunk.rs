use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{ValueToString, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkingContext, OutputChunk, OutputChunkRuntimeInfo},
    ident::AssetIdent,
    introspect::{Introspectable, IntrospectableChildren},
    output::{OutputAsset, OutputAssets},
    source_map::{GenerateSourceMap, OptionSourceMap, SourceMapAsset},
    version::VersionedContent,
};
use turbopack_ecmascript::chunk::EcmascriptChunk;

use crate::{ecmascript::content::EcmascriptDevChunkContent, DevChunkingContext};

/// Development Ecmascript chunk.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptDevChunk {
    chunking_context: Vc<DevChunkingContext>,
    chunk: Vc<EcmascriptChunk>,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunk {
    /// Creates a new [`Vc<EcmascriptDevChunk>`].
    #[turbo_tasks::function]
    pub fn new(chunking_context: Vc<DevChunkingContext>, chunk: Vc<EcmascriptChunk>) -> Vc<Self> {
        EcmascriptDevChunk {
            chunking_context,
            chunk,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptDevChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell("Ecmascript Dev Chunk".to_string()))
    }
}

#[turbo_tasks::value_impl]
impl OutputChunk for EcmascriptDevChunk {
    #[turbo_tasks::function]
    fn runtime_info(&self) -> Vc<OutputChunkRuntimeInfo> {
        OutputChunkRuntimeInfo {
            included_ids: Some(self.chunk.entry_ids()),
            ..Default::default()
        }
        .cell()
    }
}

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("ecmascript dev chunk".to_string())
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunk {
    #[turbo_tasks::function]
    async fn own_content(self: Vc<Self>) -> Result<Vc<EcmascriptDevChunkContent>> {
        let this = self.await?;
        Ok(EcmascriptDevChunkContent::new(
            this.chunking_context,
            self,
            this.chunk.chunk_content(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptDevChunk {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        let ident = self.chunk.ident().with_modifier(modifier());
        AssetIdent::from_path(self.chunking_context.chunk_path(ident, ".js".to_string()))
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

        references.extend(chunk_references.iter().copied());

        if include_source_map {
            references.push(Vc::upcast(SourceMapAsset::new(Vc::upcast(self))));
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptDevChunk {
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
impl GenerateSourceMap for EcmascriptDevChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionSourceMap> {
        self.own_content().generate_source_map()
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<String> {
    Vc::cell("dev ecmascript chunk".to_string())
}

#[turbo_tasks::function]
fn introspectable_details() -> Vc<String> {
    Vc::cell("generates a development ecmascript chunk".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for EcmascriptDevChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<String> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<String> {
        self.ident().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<String> {
        introspectable_details()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let mut children = IndexSet::new();
        let chunk = Vc::upcast::<Box<dyn Introspectable>>(self.chunk)
            .resolve()
            .await?;
        children.insert((Vc::cell("chunk".to_string()), chunk));
        Ok(Vc::cell(children))
    }
}
