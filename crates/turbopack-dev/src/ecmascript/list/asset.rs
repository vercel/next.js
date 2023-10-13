use anyhow::Result;
use serde::Serialize;
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, EvaluatableAssets},
    ident::AssetIdent,
    module::Module,
    output::{OutputAsset, OutputAssets},
    version::VersionedContent,
};

use super::content::EcmascriptDevChunkListContent;
use crate::DevChunkingContext;

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
    pub(super) chunking_context: Vc<DevChunkingContext>,
    pub(super) ident: Vc<AssetIdent>,
    pub(super) evaluatable_assets: Vc<EvaluatableAssets>,
    pub(super) chunks: Vc<OutputAssets>,
    pub(super) source: EcmascriptDevChunkListSource,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkList {
    /// Creates a new [`Vc<EcmascriptDevChunkList>`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: Vc<DevChunkingContext>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        chunks: Vc<OutputAssets>,
        source: Value<EcmascriptDevChunkListSource>,
    ) -> Vc<Self> {
        EcmascriptDevChunkList {
            chunking_context,
            ident,
            evaluatable_assets,
            chunks,
            source: source.into_value(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn own_content(self: Vc<Self>) -> Vc<EcmascriptDevChunkListContent> {
        EcmascriptDevChunkListContent::new(self)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptDevChunkList {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell("Ecmascript Dev Chunk List".to_string()))
    }
}

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("ecmascript dev chunk list".to_string())
}

#[turbo_tasks::function]
fn dynamic_modifier() -> Vc<String> {
    Vc::cell("dynamic".to_string())
}

#[turbo_tasks::function]
fn chunk_list_chunk_reference_description() -> Vc<String> {
    Vc::cell("chunk list chunk".to_string())
}

#[turbo_tasks::function]
fn chunk_key() -> Vc<String> {
    Vc::cell("chunk".to_string())
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptDevChunkList {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = self.ident.await?.clone_value();
        for &evaluatable_asset in self.evaluatable_assets.await?.iter() {
            ident.add_asset(Vc::<String>::default(), evaluatable_asset.ident());
        }
        let chunk_key = chunk_key();
        for &chunk in self.chunks.await?.iter() {
            ident.add_asset(chunk_key, chunk.ident());
        }

        ident.add_modifier(modifier());

        match self.source {
            EcmascriptDevChunkListSource::Entry => {}
            EcmascriptDevChunkListSource::Dynamic => {
                ident.add_modifier(dynamic_modifier());
            }
        }

        // We must not include the actual chunks idents as part of the chunk list's
        // ident, because it must remain stable whenever a chunk is added or
        // removed from the list.

        let ident = AssetIdent::new(Value::new(ident));
        Ok(AssetIdent::from_path(
            self.chunking_context.chunk_path(ident, ".js".to_string()),
        ))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        Ok(self.chunks)
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptDevChunkList {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        self.own_content().content()
    }

    #[turbo_tasks::function]
    fn versioned_content(self: Vc<Self>) -> Vc<Box<dyn VersionedContent>> {
        Vc::upcast(self.own_content())
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
