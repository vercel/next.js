use anyhow::{bail, Result};
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkGroupVc, ChunkListReferenceVc, ChunkingContext},
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkPlaceablesVc, EcmascriptChunkRuntime, EcmascriptChunkRuntimeContentVc,
    EcmascriptChunkRuntimeVc, EcmascriptChunkVc, EcmascriptChunkingContextVc,
};

use crate::ecmascript::content::EcmascriptDevChunkContentVc;

/// Development runtime for Ecmascript chunks.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptDevChunkRuntime {
    /// The chunking context that created this runtime.
    chunking_context: EcmascriptChunkingContextVc,
    /// All chunks of this chunk group need to be ready for execution to start.
    /// When None, it will use a chunk group created from the current chunk.
    chunk_group: Option<ChunkGroupVc>,
    /// If any evaluated entries are set, the main runtime code will be included
    /// in the chunk and the provided entries will be evaluated as soon as the
    /// chunk executes.
    evaluated_entries: Option<EcmascriptChunkPlaceablesVc>,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkRuntimeVc {
    /// Creates a new [`EcmascriptDevChunkRuntimeVc`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: EcmascriptChunkingContextVc,
        evaluated_entries: Option<EcmascriptChunkPlaceablesVc>,
    ) -> Self {
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
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell("Ecmascript Dev Runtime".to_string()))
    }
}

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("ecmascript dev chunk".to_string())
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkRuntime for EcmascriptDevChunkRuntime {
    #[turbo_tasks::function]
    async fn decorate_asset_ident(
        &self,
        origin_chunk: EcmascriptChunkVc,
        ident: AssetIdentVc,
    ) -> Result<AssetIdentVc> {
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

        Ok(AssetIdentVc::new(Value::new(ident)))
    }

    #[turbo_tasks::function]
    fn with_chunk_group(&self, chunk_group: ChunkGroupVc) -> EcmascriptDevChunkRuntimeVc {
        EcmascriptDevChunkRuntimeVc::cell(EcmascriptDevChunkRuntime {
            chunking_context: self.chunking_context,
            chunk_group: Some(chunk_group),
            evaluated_entries: self.evaluated_entries,
        })
    }

    #[turbo_tasks::function]
    fn references(&self, origin_chunk: EcmascriptChunkVc) -> AssetReferencesVc {
        let Self {
            chunk_group,
            chunking_context,
            evaluated_entries,
        } = self;

        let mut references = Vec::new();
        if evaluated_entries.is_some() {
            let chunk_group =
                chunk_group.unwrap_or_else(|| ChunkGroupVc::from_chunk(origin_chunk.into()));
            references.push(
                ChunkListReferenceVc::new(chunking_context.output_root(), chunk_group).into(),
            );
        }
        AssetReferencesVc::cell(references)
    }

    #[turbo_tasks::function]
    fn content(&self, origin_chunk: EcmascriptChunkVc) -> EcmascriptChunkRuntimeContentVc {
        EcmascriptDevChunkContentVc::new(
            origin_chunk,
            self.chunking_context,
            self.chunk_group,
            self.evaluated_entries,
        )
        .into()
    }

    #[turbo_tasks::function]
    async fn merge(
        &self,
        runtimes: Vec<EcmascriptChunkRuntimeVc>,
    ) -> Result<EcmascriptChunkRuntimeVc> {
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
            let Some(runtime) = EcmascriptDevChunkRuntimeVc::resolve_from(runtime).await? else {
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
            evaluated_entries: evaluated_entries.map(EcmascriptChunkPlaceablesVc::cell),
        }
        .cell()
        .into())
    }
}
