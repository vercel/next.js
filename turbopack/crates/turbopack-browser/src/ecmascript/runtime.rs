use anyhow::{bail, Result};
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkGroup, ChunkListReference, ChunkingContext},
    ident::AssetIdent,
};
use turbopack_ecmascript::chunk::{
    ChunkingContext, EcmascriptChunk, EcmascriptChunkPlaceables, EcmascriptChunkRuntime,
    EcmascriptChunkRuntimeContent,
};

use crate::ecmascript::content::EcmascriptDevChunkContent;

/// Development runtime for Ecmascript chunks.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptDevChunkRuntime {
    /// The chunking context that created this runtime.
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    /// All chunks of this chunk group need to be ready for execution to start.
    /// When None, it will use a chunk group created from the current chunk.
    chunk_group: Option<Vc<ChunkGroup>>,
    /// If any evaluated entries are set, the main runtime code will be included
    /// in the chunk and the provided entries will be evaluated as soon as the
    /// chunk executes.
    evaluated_entries: Option<Vc<EcmascriptChunkPlaceables>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkRuntime {
    /// Creates a new [`Vc<EcmascriptDevChunkRuntime>`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        evaluated_entries: Option<Vc<EcmascriptChunkPlaceables>>,
    ) -> Vc<Self> {
        EcmascriptDevChunkRuntime {
            chunking_context,
            chunk_group: None,
            evaluated_entries,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptDevChunkRuntime {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell("Ecmascript Dev Runtime".to_string()))
    }
}

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("ecmascript dev chunk".to_string())
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkRuntime for EcmascriptDevChunkRuntime {
    #[turbo_tasks::function]
    async fn decorate_asset_ident(
        &self,
        origin_chunk: Vc<EcmascriptChunk>,
        ident: Vc<AssetIdent>,
    ) -> Result<Vc<AssetIdent>> {
        let Self {
            chunking_context: _,
            chunk_group,
            evaluated_entries,
        } = self;

        let mut ident = ident.await?.clone_value();

        // Add a constant modifier to qualify this runtime.
        ident.add_modifier(modifier());

        // Only add other modifiers when the chunk is evaluated. Otherwise, it will
        // not receive any params and as such won't differ from another chunk in a
        // different chunk group.
        if let Some(evaluated_entries) = evaluated_entries {
            ident.modifiers.extend(
                evaluated_entries
                    .await?
                    .iter()
                    .map(|entry| entry.ident().to_string()),
            );

            // When the chunk group has changed, e.g. due to optimization, we want to
            // include the information too. Since the optimization is
            // deterministic, it's enough to include the entry chunk which is the only
            // factor that influences the chunk group chunks.
            // We want to avoid a cycle when this chunk is the entry chunk.
            if let Some(chunk_group) = chunk_group {
                let entry = chunk_group.entry().resolve().await?;
                if entry != origin_chunk.into() {
                    ident.add_modifier(entry.ident().to_string());
                }
            }
        }

        Ok(AssetIdent::new(Value::new(ident)))
    }

    #[turbo_tasks::function]
    fn with_chunk_group(&self, chunk_group: Vc<ChunkGroup>) -> Vc<EcmascriptDevChunkRuntime> {
        EcmascriptDevChunkRuntime::cell(EcmascriptDevChunkRuntime {
            chunking_context: self.chunking_context,
            chunk_group: Some(chunk_group),
            evaluated_entries: self.evaluated_entries,
        })
    }

    #[turbo_tasks::function]
    fn references(&self, origin_chunk: Vc<EcmascriptChunk>) -> Vc<AssetReferences> {
        let Self {
            chunk_group,
            chunking_context,
            evaluated_entries,
        } = self;

        let mut references = vec![];
        if evaluated_entries.is_some() {
            let chunk_group =
                chunk_group.unwrap_or_else(|| ChunkGroup::from_chunk(origin_chunk.into()));
            references.push(Vc::upcast(ChunkListReference::new(
                chunking_context.output_root(),
                chunk_group,
            )));
        }
        Vc::cell(references)
    }

    #[turbo_tasks::function]
    fn content(&self, origin_chunk: Vc<EcmascriptChunk>) -> Vc<EcmascriptChunkRuntimeContent> {
        Vc::upcast(EcmascriptDevChunkContent::new(
            origin_chunk,
            self.chunking_context,
            self.chunk_group,
            self.evaluated_entries,
        ))
    }

    #[turbo_tasks::function]
    async fn merge(
        &self,
        runtimes: Vec<Vc<EcmascriptChunkRuntime>>,
    ) -> Result<Vc<EcmascriptChunkRuntime>> {
        let Self {
            chunking_context,
            chunk_group,
            evaluated_entries,
        } = self;

        let chunking_context = chunking_context.resolve().await?;
        let chunk_group = if let Some(chunk_group) = chunk_group {
            Some(chunk_group.resolve().await?)
        } else {
            None
        };

        let mut evaluated_entries = if let Some(evaluated_entries) = evaluated_entries {
            Some(evaluated_entries.await?.clone_value())
        } else {
            None
        };

        for runtime in runtimes {
            let Some(runtime) =
                Vc::try_resolve_downcast_type::<EcmascriptDevChunkRuntime>(runtime).await?
            else {
                bail!("cannot merge EcmascriptDevChunkRuntime with non-EcmascriptDevChunkRuntime");
            };

            let Self {
                chunking_context: other_chunking_context,
                chunk_group: other_chunk_group,
                evaluated_entries: other_evaluated_entries,
            } = &*runtime.await?;

            let other_chunking_context = other_chunking_context.resolve().await?;
            let other_chunk_group = if let Some(other_chunk_group) = other_chunk_group {
                Some(other_chunk_group.resolve().await?)
            } else {
                None
            };

            if chunking_context != other_chunking_context {
                bail!("cannot merge EcmascriptDevChunkRuntime with different chunking contexts",);
            }

            if chunk_group != other_chunk_group {
                bail!("cannot merge EcmascriptDevChunkRuntime with different chunk groups",);
            }

            match (&mut evaluated_entries, other_evaluated_entries) {
                (Some(evaluated_entries), Some(other_evaluated_entries)) => {
                    evaluated_entries.extend(other_evaluated_entries.await?.iter().copied());
                }
                (None, Some(other_evaluated_entries)) => {
                    evaluated_entries = Some(other_evaluated_entries.await?.clone_value());
                }
                _ => {}
            }
        }

        Ok(EcmascriptDevChunkRuntime {
            chunking_context,
            chunk_group,
            evaluated_entries: evaluated_entries.map(Vc::cell),
        }
        .cell()
        .into())
    }
}
