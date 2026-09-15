use anyhow::{Context, Result};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkingContext, OutputChunk, OutputChunkRuntimeInfo},
    ident::AssetIdent,
    introspect::{Introspectable, IntrospectableChildren},
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::{GenerateSourceMap, SourceMapAsset},
    version::VersionedContent,
};
use turbopack_ecmascript::chunk::EcmascriptChunk;

use crate::{BrowserChunkingContext, ecmascript::content::EcmascriptBrowserChunkContent};

/// Development Ecmascript chunk.
#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("Ecmascript Dev Chunk")]
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
            this.ident_for_path().await?,
            Vc::upcast(self),
        ))
    }
}

impl EcmascriptBrowserChunk {
    async fn component_chunk_assets(&self) -> Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>> {
        let component_chunks = self.chunk.component_chunks().await?;
        let mut assets = Vec::with_capacity(component_chunks.len());
        for &component in component_chunks.iter() {
            let component_chunk = ResolvedVc::try_downcast_type::<EcmascriptChunk>(component)
                .context("merged chunk component_chunks must be ecmascript chunks")?;
            assets.push(ResolvedVc::upcast(
                EcmascriptBrowserChunk::new(*self.chunking_context, *component_chunk)
                    .to_resolved()
                    .await?,
            ));
        }
        Ok(assets)
    }

    async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .chunk
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("ecmascript dev chunk"))
            .into_vc())
    }
}

#[turbo_tasks::value_impl]
impl OutputChunk for EcmascriptBrowserChunk {
    #[turbo_tasks::function]
    async fn runtime_info(&self) -> Result<Vc<OutputChunkRuntimeInfo>> {
        let component_assets = self.component_chunk_assets().await?;
        let module_chunks = if component_assets.is_empty() {
            None
        } else {
            Some(ResolvedVc::cell(component_assets))
        };
        Ok(OutputChunkRuntimeInfo {
            included_ids: Some(self.chunk.entry_ids().to_resolved().await?),
            module_chunks,
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserChunk {
    #[turbo_tasks::function]
    pub(crate) async fn own_content(self: Vc<Self>) -> Result<Vc<EcmascriptBrowserChunkContent>> {
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
impl OutputAssetsReference for EcmascriptBrowserChunk {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        let chunk_references = this.chunk.references().await?;
        let include_source_map = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;
        let ref_assets = chunk_references.assets.await?;
        let mut assets =
            Vec::with_capacity(ref_assets.len() + if include_source_map { 1 } else { 0 });

        assets.extend(ref_assets.iter().copied());

        if include_source_map {
            assets.push(ResolvedVc::upcast(self.source_map().to_resolved().await?));
        }

        // Constituent component chunks of a merged chunk are emitted as referenced assets
        // so the runtime can fetch an individual component when it's already cached, without
        // them being eagerly loaded as primary chunks.
        let component_assets = this.component_chunk_assets().await?;
        let referenced_assets = if component_assets.is_empty() {
            chunk_references.referenced_assets
        } else {
            let mut referenced: Vec<_> = chunk_references
                .referenced_assets
                .await?
                .iter()
                .copied()
                .collect();
            referenced.extend(component_assets);
            ResolvedVc::cell(referenced)
        };

        Ok(OutputAssetsWithReferenced {
            assets: ResolvedVc::cell(assets),
            referenced_assets,
            references: chunk_references.references,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBrowserChunk {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = this.ident_for_path().await?;
        Ok(this
            .chunking_context
            .chunk_path(Some(Vc::upcast(self)), ident, None, rcstr!(".js")))
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
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.own_content().generate_source_map()
    }

    #[turbo_tasks::function]
    fn by_section(self: Vc<Self>, section: RcStr) -> Vc<FileContent> {
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
