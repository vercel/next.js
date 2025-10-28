use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkingContext, OutputChunk, OutputChunkRuntimeInfo},
    ident::AssetIdent,
    introspect::{Introspectable, IntrospectableChildren},
    output::{OutputAsset, OutputAssets},
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap, SourceMapAsset},
    version::VersionedContent,
};
use turbopack_ecmascript::chunk::EcmascriptChunk;

use crate::{BrowserChunkingContext, ecmascript::content::EcmascriptBrowserChunkContent};

/// Development Ecmascript chunk.
#[turbo_tasks::value(shared)]
pub struct EcmascriptBrowserChunk {
    chunking_context: ResolvedVc<BrowserChunkingContext>,
    chunk: ResolvedVc<EcmascriptChunk>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserChunk {
    /// Creates a new [`Vc<EcmascriptDevChunk>`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<BrowserChunkingContext>,
        chunk: ResolvedVc<EcmascriptChunk>,
    ) -> Vc<Self> {
        EcmascriptBrowserChunk {
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
            this.ident_for_path(),
            Vc::upcast(self),
        ))
    }
}

impl EcmascriptBrowserChunk {
    fn ident_for_path(&self) -> Vc<AssetIdent> {
        self.chunk
            .ident()
            .with_modifier(rcstr!("ecmascript dev chunk"))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptBrowserChunk {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("Ecmascript Dev Chunk"))
    }
}

#[turbo_tasks::value_impl]
impl OutputChunk for EcmascriptBrowserChunk {
    #[turbo_tasks::function]
    async fn runtime_info(&self) -> Result<Vc<OutputChunkRuntimeInfo>> {
        Ok(OutputChunkRuntimeInfo {
            included_ids: Some(self.chunk.entry_ids().to_resolved().await?),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserChunk {
    #[turbo_tasks::function]
    async fn own_content(self: Vc<Self>) -> Result<Vc<EcmascriptBrowserChunkContent>> {
        let this = self.await?;
        Ok(EcmascriptBrowserChunkContent::new(
            *this.chunking_context,
            self,
            this.chunk.chunk_content(),
            self.source_map(),
        ))
    }

    #[turbo_tasks::function]
    pub fn chunk(&self) -> Result<Vc<Box<dyn Chunk>>> {
        Ok(Vc::upcast(*self.chunk))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBrowserChunk {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = this.ident_for_path();
        Ok(this
            .chunking_context
            .chunk_path(Some(Vc::upcast(self)), ident, None, rcstr!(".js")))
    }

    #[turbo_tasks::function]
    fn size_bytes(self: Vc<Self>) -> Vc<Option<u64>> {
        self.own_content().content().len()
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
            references.push(ResolvedVc::upcast(self.source_map().to_resolved().await?));
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBrowserChunk {
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
impl GenerateSourceMap for EcmascriptBrowserChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionStringifiedSourceMap> {
        self.own_content().generate_source_map()
    }

    #[turbo_tasks::function]
    fn by_section(self: Vc<Self>, section: RcStr) -> Vc<OptionStringifiedSourceMap> {
        self.own_content().by_section(section)
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for EcmascriptBrowserChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("dev ecmascript chunk"))
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        self.path().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("generates a development ecmascript chunk"))
    }

    #[turbo_tasks::function]
    fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let mut children = FxIndexSet::default();
        let chunk = ResolvedVc::upcast::<Box<dyn Introspectable>>(self.chunk);
        children.insert((rcstr!("chunk"), chunk));
        Ok(Vc::cell(children))
    }
}
