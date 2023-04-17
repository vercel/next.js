use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        ChunkingContext, OutputChunk, OutputChunkRuntimeInfo, OutputChunkRuntimeInfoVc,
        OutputChunkVc, ParallelChunkReference, ParallelChunkReferenceVc,
    },
    ident::AssetIdentVc,
    introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc},
    reference::AssetReferencesVc,
    source_map::{
        GenerateSourceMap, GenerateSourceMapVc, OptionSourceMapVc, SourceMapAssetReferenceVc,
    },
    version::{VersionedContent, VersionedContentVc},
};
use turbopack_ecmascript::chunk::EcmascriptChunkVc;

use crate::{ecmascript::content::EcmascriptDevChunkContentVc, DevChunkingContextVc};

/// Development Ecmascript chunk.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptDevChunk {
    chunking_context: DevChunkingContextVc,
    chunk: EcmascriptChunkVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkVc {
    /// Creates a new [`EcmascriptDevChunkVc`].
    #[turbo_tasks::function]
    pub fn new(chunking_context: DevChunkingContextVc, chunk: EcmascriptChunkVc) -> Self {
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
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell("Ecmascript Dev Chunk".to_string()))
    }
}

#[turbo_tasks::value_impl]
impl OutputChunk for EcmascriptDevChunk {
    #[turbo_tasks::function]
    fn runtime_info(&self) -> OutputChunkRuntimeInfoVc {
        OutputChunkRuntimeInfo {
            included_ids: Some(self.chunk.entry_ids()),
            ..Default::default()
        }
        .cell()
    }
}

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("ecmascript dev chunk".to_string())
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkVc {
    #[turbo_tasks::function]
    async fn own_content(self) -> Result<EcmascriptDevChunkContentVc> {
        let this = self.await?;
        Ok(EcmascriptDevChunkContentVc::new(
            this.chunking_context,
            self,
            this.chunk.chunk_content(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptDevChunk {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        let ident = self.chunk.ident().with_modifier(modifier());
        AssetIdentVc::from_path(self.chunking_context.chunk_path(ident, ".js"))
    }

    #[turbo_tasks::function]
    async fn references(self_vc: EcmascriptDevChunkVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let chunk_references = this.chunk.references().await?;
        let mut references = Vec::with_capacity(chunk_references.len() + 1);

        // In contrast to the inner chunk, the outer chunk should not have
        // references of parallel chunk since these are already handled
        // at the [ChunkGroup] level.
        for reference in &*chunk_references {
            if let Some(parallel_ref) = ParallelChunkReferenceVc::resolve_from(*reference).await? {
                if *parallel_ref.is_loaded_in_parallel().await? {
                    continue;
                }
            }
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
    fn content(self_vc: EcmascriptDevChunkVc) -> AssetContentVc {
        self_vc.own_content().content()
    }

    #[turbo_tasks::function]
    fn versioned_content(self_vc: EcmascriptDevChunkVc) -> VersionedContentVc {
        self_vc.own_content().into()
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptDevChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: EcmascriptDevChunkVc) -> OptionSourceMapVc {
        self_vc.own_content().generate_source_map()
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("dev ecmascript chunk".to_string())
}

#[turbo_tasks::function]
fn introspectable_details() -> StringVc {
    StringVc::cell("generates a development ecmascript chunk".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for EcmascriptDevChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self_vc: EcmascriptDevChunkVc) -> StringVc {
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
