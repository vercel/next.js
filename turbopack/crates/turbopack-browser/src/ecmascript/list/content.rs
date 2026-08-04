use std::io::Write;

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use either::Either;
use indoc::writedoc;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    code_builder::{Code, CodeBuilder},
    output::OutputAsset,
    version::{
        MergeableVersionedContent, Update, Version, VersionedContent, VersionedContentMerger,
    },
};
use turbopack_ecmascript::utils::StringifyJs;

use super::{
    asset::{EcmascriptDevChunkList, EcmascriptDevChunkListSource},
    update::update_chunk_list,
    version::EcmascriptDevChunkListVersion,
};
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

/// Contents of an [`EcmascriptDevChunkList`].
#[turbo_tasks::value]
pub(super) struct EcmascriptDevChunkListContent {
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
        let chunk_list_ref = turbo_tasks::read!(chunk_list)?;
        let output_root = turbo_tasks::read!(chunk_list_ref.chunking_context.output_root())?;
        let current_chunk_method =
            match *turbo_tasks::read!(chunk_list_ref.chunking_context.current_chunk_method())? {
                CurrentChunkMethod::StringLiteral => {
                    let path = output_root
                        .get_path_to(&*turbo_tasks::read!(chunk_list.path())?)
                        .context("chunk list path not in output root")?
                        .into();
                    CurrentChunkMethodWithData::StringLiteral(path)
                }
                CurrentChunkMethod::DocumentCurrentScript => {
                    CurrentChunkMethodWithData::DocumentCurrentScript
                }
            };
        let chunk_loading_global =
            (*turbo_tasks::read!(chunk_list_ref.chunking_context.chunk_loading_global())?).clone();
        let chunks = turbo_tasks::read!(chunk_list_ref.chunks)?;
        // The sync `parallel!` only fans out plain `Vc` reads, so the multi-step
        // per-item work runs concurrently in the async build (as before) and
        // sequentially under `sync`.
        #[cfg(not(feature = "sync"))]
        let chunks_contents: FxIndexMap<String, ResolvedVc<Box<dyn VersionedContent>>> = chunks
            .iter()
            .map(async |chunk| {
                Ok((
                    output_root
                        .get_path_to(&*turbo_tasks::read!(chunk.path())?)
                        .map(|path| path.to_string()),
                    turbo_tasks::read!(chunk.versioned_content().to_resolved())?,
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .filter_map(|(path, content)| path.map(|path| (path, content)))
            .collect();
        #[cfg(feature = "sync")]
        let chunks_contents: FxIndexMap<String, ResolvedVc<Box<dyn VersionedContent>>> = {
            let mut chunks_contents = FxIndexMap::default();
            for chunk in chunks.iter() {
                let path = output_root
                    .get_path_to(&*turbo_tasks::read!(chunk.path())?)
                    .map(|path| path.to_string());
                let content = turbo_tasks::read!(chunk.versioned_content().to_resolved())?;
                if let Some(path) = path {
                    chunks_contents.insert(path, content);
                }
            }
            chunks_contents
        };
        Ok(EcmascriptDevChunkListContent {
            current_chunk_method,
            chunks_contents,
            source: chunk_list_ref.source,
            chunk_loading_global,
        }
        .cell())
    }

    /// Computes the version of this content.
    #[turbo_tasks::function]
    pub async fn version(&self) -> Result<Vc<EcmascriptDevChunkListVersion>> {
        let mut by_merger = FxIndexMap::<_, Vec<_>>::default();
        let mut by_path = FxIndexMap::<_, _>::default();

        for (chunk_path, chunk_content) in &self.chunks_contents {
            if let Some(mergeable) =
                ResolvedVc::try_sidecast::<Box<dyn MergeableVersionedContent>>(*chunk_content)
            {
                let merger = turbo_tasks::read!(mergeable.get_merger().to_resolved())?;
                by_merger.entry(merger).or_default().push(*chunk_content);
            } else {
                by_path.insert(
                    chunk_path.clone(),
                    turbo_tasks::read!(chunk_content.version().into_trait_ref())?,
                );
            }
        }

        // The sync `parallel!` only fans out plain `Vc` reads, so the multi-step
        // per-item work runs concurrently in the async build (as before) and
        // sequentially under `sync`.
        #[cfg(not(feature = "sync"))]
        let by_merger = by_merger
            .into_iter()
            .map(|(merger, contents)| (merger, Vc::cell(contents)))
            .map(async |(merger, contents)| {
                Ok((
                    merger,
                    turbo_tasks::read!(merger.merge(contents).version().into_trait_ref())?,
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .collect();
        #[cfg(feature = "sync")]
        let by_merger = {
            let mut result = FxIndexMap::default();
            for (merger, contents) in by_merger.into_iter() {
                let contents = Vc::cell(contents);
                result.insert(
                    merger,
                    turbo_tasks::read!(merger.merge(contents).version().into_trait_ref())?,
                );
            }
            result
        };

        Ok(EcmascriptDevChunkListVersion { by_path, by_merger }.cell())
    }

    #[turbo_tasks::function]
    pub(super) async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = turbo_tasks::read!(self)?;

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
        let code = turbo_tasks::read!(self.code())?;
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
        turbo_tasks::read!(update_chunk_list(self, from_version))
    }
}
