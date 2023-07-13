use anyhow::Result;
use serde::Serialize;
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkVc, ChunkingContext},
    ident::AssetIdentVc,
    output::{OutputAsset, OutputAssetVc, OutputAssetsVc},
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
    version::{VersionedContent, VersionedContentVc},
};

use super::content::EcmascriptDevChunkListContentVc;
use crate::DevChunkingContextVc;

/// An asset that represents a list of chunks that exist together in a chunk
/// group, and should be *updated* together.
///
/// The chunk list's content registers itself as a Turbopack chunk and a chunk
/// list.
///
/// Then, on updates, it merges updates from its chunks into a single update
/// when possible. This is useful for keeping track of changes that affect more
/// than one chunk, or affect the chunk group, e.g.:
/// * moving a module from one chunk to another;
/// * changing a chunk's path.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptDevChunkList {
    pub(super) chunking_context: DevChunkingContextVc,
    pub(super) entry_chunk: ChunkVc,
    pub(super) chunks: OutputAssetsVc,
    pub(super) source: EcmascriptDevChunkListSource,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkListVc {
    /// Creates a new [`EcmascriptDevChunkListVc`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: DevChunkingContextVc,
        entry_chunk: ChunkVc,
        chunks: OutputAssetsVc,
        source: Value<EcmascriptDevChunkListSource>,
    ) -> Self {
        EcmascriptDevChunkList {
            chunking_context,
            entry_chunk,
            chunks,
            source: source.into_value(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn own_content(self) -> EcmascriptDevChunkListContentVc {
        EcmascriptDevChunkListContentVc::new(self)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptDevChunkList {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell("Ecmascript Dev Chunk List".to_string()))
    }
}

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("ecmascript dev chunk list".to_string())
}

#[turbo_tasks::function]
fn chunk_list_chunk_reference_description() -> StringVc {
    StringVc::cell("chunk list chunk".to_string())
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptDevChunkList {}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptDevChunkList {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        let mut ident = self.entry_chunk.ident().await?.clone_value();

        ident.add_modifier(modifier());

        // We must not include the actual chunks idents as part of the chunk list's
        // ident, because it must remain stable whenever a chunk is added or
        // removed from the list.

        let ident = AssetIdentVc::new(Value::new(ident));
        Ok(AssetIdentVc::from_path(
            self.chunking_context.chunk_path(ident, ".js"),
        ))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(AssetReferencesVc::cell(
            self.chunks
                .await?
                .iter()
                .map(|&chunk| {
                    SingleAssetReferenceVc::new(
                        chunk.into(),
                        chunk_list_chunk_reference_description(),
                    )
                    .into()
                })
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    fn content(self_vc: EcmascriptDevChunkListVc) -> AssetContentVc {
        self_vc.own_content().content()
    }

    #[turbo_tasks::function]
    fn versioned_content(self_vc: EcmascriptDevChunkListVc) -> VersionedContentVc {
        self_vc.own_content().into()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EcmascriptDevChunkListParams<'a> {
    /// Path to the chunk list to register.
    path: &'a str,
    /// All chunks that belong to the chunk list.
    chunks: Vec<String>,
    /// Where this chunk list is from.
    source: EcmascriptDevChunkListSource,
}

#[derive(Debug, Clone, Copy, Ord, PartialOrd, Hash)]
#[turbo_tasks::value(serialization = "auto_for_input")]
#[serde(rename_all = "camelCase")]
pub enum EcmascriptDevChunkListSource {
    /// The chunk list is from a runtime entry.
    Entry,
    /// The chunk list is from a dynamic import.
    Dynamic,
}
