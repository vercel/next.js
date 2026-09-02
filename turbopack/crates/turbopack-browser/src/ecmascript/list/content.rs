use std::io::Write;

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use either::Either;
use indoc::writedoc;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, TryJoinIterExt, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    code_builder::{Code, CodeBuilder},
    output::OutputAsset,
    version::{Update, Version, VersionedContent},
};
use turbopack_ecmascript::{
    chunk_list::{
        update::update_chunk_list,
        version::{ChunkListVersion, compute_chunk_list_version},
    },
    utils::StringifyJs,
};

use super::asset::{EcmascriptDevChunkList, EcmascriptDevChunkListSource};
use crate::chunking_context::{
    CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR, CurrentChunkMethod,
};

#[derive(
    Clone, Debug, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, NonLocalValue, Encode, Decode,
)]
enum CurrentChunkMethodWithData {
    StringLiteral(RcStr),
    DocumentCurrentScript,
}

#[turbo_tasks::value]
pub struct EcmascriptDevChunkListContent {
    current_chunk_method: CurrentChunkMethodWithData,
    #[bincode(with = "turbo_bincode::indexmap")]
    pub(super) chunks_contents: FxIndexMap<String, ResolvedVc<Box<dyn VersionedContent>>>,
    source: EcmascriptDevChunkListSource,
    /// The global variable name used for chunk loading (derived from chunkLoadingGlobal config).
    chunk_loading_global: RcStr,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkListContent {
    /// Creates a new [`EcmascriptDevChunkListContent`].
    #[turbo_tasks::function]
    pub async fn new(chunk_list: Vc<EcmascriptDevChunkList>) -> Result<Vc<Self>> {
        let chunk_list_ref = chunk_list.await?;
        let output_root = chunk_list_ref.chunking_context.output_root().await?;
        let current_chunk_method = match *chunk_list_ref
            .chunking_context
            .current_chunk_method()
            .await?
        {
            CurrentChunkMethod::StringLiteral => {
                let path = output_root
                    .get_path_to(&*chunk_list.path().await?)
                    .context("chunk list path not in output root")?
                    .into();
                CurrentChunkMethodWithData::StringLiteral(path)
            }
            CurrentChunkMethod::DocumentCurrentScript => {
                CurrentChunkMethodWithData::DocumentCurrentScript
            }
        };
        let chunk_loading_global = (*chunk_list_ref
            .chunking_context
            .chunk_loading_global()
            .await?)
            .clone();
        Ok(EcmascriptDevChunkListContent {
            current_chunk_method,
            chunks_contents: chunk_list_ref
                .chunks
                .await?
                .iter()
                .map(async |chunk| {
                    Ok((
                        output_root
                            .get_path_to(&*chunk.path().await?)
                            .map(|path| path.to_string()),
                        chunk.versioned_content().to_resolved().await?,
                    ))
                })
                .try_join()
                .await?
                .into_iter()
                .filter_map(|(path, content)| path.map(|path| (path, content)))
                .collect(),
            source: chunk_list_ref.source,
            chunk_loading_global,
        }
        .cell())
    }

    /// Computes the version of this content.
    #[turbo_tasks::function]
    pub async fn version(&self) -> Result<Vc<ChunkListVersion>> {
        compute_chunk_list_version(&self.chunks_contents).await
    }

    #[turbo_tasks::function]
    pub(super) async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;

        let chunks = this
            .chunks_contents
            .keys()
            .map(|s| s.as_str())
            .collect::<Vec<_>>();

        let script_or_path = match &this.current_chunk_method {
            CurrentChunkMethodWithData::StringLiteral(path) => Either::Left(StringifyJs(path)),
            CurrentChunkMethodWithData::DocumentCurrentScript => {
                Either::Right(CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR)
            }
        };

        let mut code = CodeBuilder::default();

        // When loaded, JS chunks must register themselves with the `TURBOPACK` global
        // variable. Similarly, we register the chunk list with the
        // `{chunk_loading_global}_CHUNK_LISTS` global variable.
        let chunk_lists_global = format!("{}_CHUNK_LISTS", this.chunk_loading_global);
        writedoc!(
            code,
            // `||=` would be better but we need to be es2020 compatible
            //`x || (x = default)` is better than `x = x || default` simply because we avoid _writing_ the property in the common case.
            r#"
                (globalThis[{chunk_lists_global}] || (globalThis[{chunk_lists_global}] = [])).push({{
                    script: {script_or_path},
                    chunks: {chunks},
                    source: {source}
                }});
            "#,
            chunk_lists_global = StringifyJs(&chunk_lists_global),
            chunks = StringifyJs(&chunks),
            source = StringifyJs(&this.source),
        )?;

        Ok(Code::cell(code.build()))
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptDevChunkListContent {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;
        Ok(AssetContent::file(
            FileContent::Content(File::from(code.source_code().clone())).cell(),
        ))
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.version())
    }

    #[turbo_tasks::function]
    async fn update(
        self: ResolvedVc<Self>,
        from_version: ResolvedVc<Box<dyn Version>>,
    ) -> Result<Vc<Update>> {
        let this = self.await?;
        update_chunk_list(&this.chunks_contents, self.version(), from_version).await
    }
}
