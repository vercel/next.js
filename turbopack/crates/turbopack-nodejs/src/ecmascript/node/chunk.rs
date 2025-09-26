use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkingContext},
    introspect::{Introspectable, IntrospectableChildren},
    output::{OutputAsset, OutputAssets},
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap, SourceMapAsset},
    version::VersionedContent,
};
use turbopack_ecmascript::chunk::EcmascriptChunk;

use super::content::EcmascriptBuildNodeChunkContent;
use crate::NodeJsChunkingContext;

/// Production Ecmascript chunk targeting Node.js.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptBuildNodeChunk {
    chunking_context: ResolvedVc<NodeJsChunkingContext>,
    chunk: ResolvedVc<EcmascriptChunk>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunk {
    /// Creates a new [`Vc<EcmascriptBuildNodeChunk>`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        chunk: ResolvedVc<EcmascriptChunk>,
    ) -> Vc<Self> {
        EcmascriptBuildNodeChunk {
            chunking_context,
            chunk,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn source_map(self: Vc<Self>) -> Result<Vc<SourceMapAsset>> {
        let this = self.await?;
        Ok(SourceMapAsset::new(
            Vc::upcast(*this.chunking_context),
            this.chunk.ident().with_modifier(modifier()),
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("Ecmascript Build Node Chunk"))
    }
}

fn modifier() -> RcStr {
    rcstr!("ecmascript build node chunk")
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    async fn own_content(self: Vc<Self>) -> Result<Vc<EcmascriptBuildNodeChunkContent>> {
        let this = self.await?;
        Ok(EcmascriptBuildNodeChunkContent::new(
            *this.chunking_context,
            self,
            this.chunk.chunk_content(),
            self.source_map(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = this.chunk.ident().with_modifier(modifier());
        Ok(this
            .chunking_context
            .chunk_path(Some(Vc::upcast(self)), ident, None, rcstr!(".js")))
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
            references.push(ResolvedVc::upcast(self.source_map().to_resolved().await?));
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
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionStringifiedSourceMap> {
        self.own_content().generate_source_map()
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for EcmascriptBuildNodeChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("ecmascript build node chunk"))
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        self.path().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!(
            "generates a production EcmaScript chunk targeting Node.js"
        ))
    }

    #[turbo_tasks::function]
    fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let mut children = FxIndexSet::default();
        let introspectable_chunk = ResolvedVc::upcast::<Box<dyn Introspectable>>(self.chunk);
        children.insert((rcstr!("chunk"), introspectable_chunk));
        Ok(Vc::cell(children))
    }
}
