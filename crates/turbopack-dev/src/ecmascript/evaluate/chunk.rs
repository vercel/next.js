use std::io::Write;

use anyhow::{bail, Result};
use indoc::writedoc;
use serde::Serialize;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{embed_file, File, FileContent};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc, AssetsVc},
    chunk::{ChunkVc, ChunkingContext, EvaluatableAssetsVc, ModuleIdReadRef},
    code_builder::{CodeBuilder, CodeVc},
    environment::ChunkLoading,
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
    source_map::{
        GenerateSourceMap, GenerateSourceMapVc, OptionSourceMapVc, SourceMapAssetReferenceVc,
    },
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc},
    utils::StringifyJs,
};

use crate::{
    ecmascript::chunk_data::{ChunkDataVc, ChunksDataVc},
    DevChunkingContextVc,
};

/// An Ecmascript chunk that:
/// * Contains the Turbopack dev runtime code; and
/// * Evaluates a list of runtime entries.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptDevEvaluateChunk {
    chunking_context: DevChunkingContextVc,
    entry_chunk: ChunkVc,
    other_chunks: AssetsVc,
    evaluatable_assets: EvaluatableAssetsVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevEvaluateChunkVc {
    /// Creates a new [`EcmascriptDevEvaluateChunkVc`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: DevChunkingContextVc,
        entry_chunk: ChunkVc,
        other_chunks: AssetsVc,
        evaluatable_assets: EvaluatableAssetsVc,
    ) -> Self {
        EcmascriptDevEvaluateChunk {
            chunking_context,
            entry_chunk,
            other_chunks,
            evaluatable_assets,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn chunks_data(self) -> Result<ChunksDataVc> {
        let this = self.await?;
        Ok(ChunkDataVc::from_assets(
            this.chunking_context.output_root(),
            this.other_chunks,
        ))
    }

    #[turbo_tasks::function]
    async fn code(self) -> Result<CodeVc> {
        let this = self.await?;

        let output_root = this.chunking_context.output_root().await?;
        let chunk_path = self.ident().path().await?;
        let chunk_public_path = if let Some(path) = output_root.get_path_to(&chunk_path) {
            path
        } else {
            bail!(
                "chunk path {} is not in output root {}",
                chunk_path.to_string(),
                output_root.to_string()
            );
        };

        let other_chunks_data = self.chunks_data().await?;
        let other_chunks_data = other_chunks_data.iter().try_join().await?;
        let other_chunks_data: Vec<_> = other_chunks_data
            .iter()
            .map(|chunk_data| chunk_data.runtime_chunk_data())
            .collect();

        let runtime_module_ids = this
            .evaluatable_assets
            .await?
            .iter()
            .map({
                let chunking_context = this.chunking_context;
                move |entry| async move {
                    if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(entry).await?
                    {
                        Ok(Some(
                            placeable
                                .as_chunk_item(chunking_context.into())
                                .id()
                                .await?,
                        ))
                    } else {
                        Ok(None)
                    }
                }
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect();

        let params = EcmascriptDevChunkRuntimeParams {
            other_chunks: &other_chunks_data,
            runtime_module_ids,
        };

        let mut code = CodeBuilder::default();

        // We still use the `TURBOPACK` global variable to store the chunk here,
        // as there may be another runtime already loaded in the page.
        // This is the case in integration tests.
        writedoc!(
            code,
            r#"
                (globalThis.TURBOPACK = globalThis.TURBOPACK || []).push([
                    {},
                    {{}},
                    {}
                ]);
                (() => {{
                if (!Array.isArray(globalThis.TURBOPACK)) {{
                    return;
                }}
            "#,
            StringifyJs(&chunk_public_path),
            StringifyJs(&params),
        )?;

        let shared_runtime_code = embed_file!("js/src/runtime.js").await?;

        match &*shared_runtime_code {
            FileContent::NotFound => bail!("shared runtime code is not found"),
            FileContent::Content(file) => code.push_source(file.content(), None),
        };

        // The specific runtime code depends on declarations in the shared runtime code,
        // hence it must be appended after it.
        let specific_runtime_code =
            match &*this.chunking_context.environment().chunk_loading().await? {
                ChunkLoading::None => embed_file!("js/src/runtime.none.js").await?,
                ChunkLoading::NodeJs => embed_file!("js/src/runtime.nodejs.js").await?,
                ChunkLoading::Dom => embed_file!("js/src/runtime.dom.js").await?,
            };

        match &*specific_runtime_code {
            FileContent::NotFound => bail!("specific runtime code is not found"),
            FileContent::Content(file) => code.push_source(file.content(), None),
        };

        // Registering chunks depends on the BACKEND variable, which is set by the
        // specific runtime code, hence it must be appended after it.
        writedoc!(
            code,
            r#"
                const chunksToRegister = globalThis.TURBOPACK;
                globalThis.TURBOPACK = {{ push: registerChunk }};
                chunksToRegister.forEach(registerChunk);
                }})();
            "#
        )?;

        if code.has_source_map() {
            let filename = chunk_path.file_name();
            write!(code, "\n\n//# sourceMappingURL={}.map", filename)?;
        }

        Ok(CodeVc::cell(code.build()))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptDevEvaluateChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell("Ecmascript Dev Evaluate Chunk".to_string()))
    }
}

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("ecmascript dev evaluate chunk".to_string())
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptDevEvaluateChunk {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        let mut ident = self.entry_chunk.ident().await?.clone_value();

        ident.add_modifier(modifier());

        ident.modifiers.extend(
            self.evaluatable_assets
                .await?
                .iter()
                .map(|entry| entry.ident().to_string()),
        );

        for chunk in &*self.other_chunks.await? {
            ident.add_modifier(chunk.ident().to_string());
        }

        let ident = AssetIdentVc::new(Value::new(ident));
        Ok(AssetIdentVc::from_path(
            self.chunking_context.chunk_path(ident, ".js"),
        ))
    }

    #[turbo_tasks::function]
    async fn references(self_vc: EcmascriptDevEvaluateChunkVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let mut references = Vec::new();

        if *this
            .chunking_context
            .reference_chunk_source_maps(self_vc.into())
            .await?
        {
            references.push(SourceMapAssetReferenceVc::new(self_vc.into()).into());
        }

        for chunk_data in &*self_vc.chunks_data().await? {
            references.extend(chunk_data.references().await?.iter().copied());
        }

        Ok(AssetReferencesVc::cell(references))
    }

    #[turbo_tasks::function]
    async fn content(self_vc: EcmascriptDevEvaluateChunkVc) -> Result<AssetContentVc> {
        let code = self_vc.code().await?;
        Ok(File::from(code.source_code().clone()).into())
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptDevEvaluateChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: EcmascriptDevEvaluateChunkVc) -> OptionSourceMapVc {
        self_vc.code().generate_source_map()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EcmascriptDevChunkRuntimeParams<'a, T> {
    /// Other chunks in the chunk group this chunk belongs to, if any. Does not
    /// include the chunk itself.
    ///
    /// These chunks must be loaed before the runtime modules can be
    /// instantiated.
    other_chunks: &'a [T],
    /// List of module IDs that this chunk should instantiate when executed.
    runtime_module_ids: Vec<ModuleIdReadRef>,
}
