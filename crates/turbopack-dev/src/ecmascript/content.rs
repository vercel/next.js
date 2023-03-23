use std::io::Write;

use anyhow::{bail, Context, Result};
use indoc::writedoc;
use serde::Serialize;
use turbo_tasks::TryJoinIterExt;
use turbo_tasks_fs::{embed_file, File, FileContent};
use turbopack_core::{
    asset::AssetContentVc,
    chunk::{Chunk, ChunkGroupVc, ChunkingContext, ModuleId, ModuleIdReadRef},
    code_builder::{CodeBuilder, CodeVc},
    environment::ChunkLoading,
    source_map::{GenerateSourceMap, GenerateSourceMapVc, OptionSourceMapVc},
    version::{
        MergeableVersionedContent, MergeableVersionedContentVc, UpdateVc, VersionVc,
        VersionedContent, VersionedContentMergerVc, VersionedContentVc,
    },
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkPlaceable, EcmascriptChunkPlaceablesVc, EcmascriptChunkRuntimeContent,
        EcmascriptChunkRuntimeContentVc, EcmascriptChunkVc, EcmascriptChunkingContextVc,
    },
    utils::StringifyJs,
};

use super::{
    content_entry::EcmascriptDevChunkContentEntriesVc,
    merged::merger::EcmascriptDevChunkContentMergerVc, version::EcmascriptDevChunkVersionVc,
};

#[turbo_tasks::value(serialization = "none")]
pub(super) struct EcmascriptDevChunkContent {
    pub(super) entries: EcmascriptDevChunkContentEntriesVc,
    pub(super) chunking_context: EcmascriptChunkingContextVc,
    pub(super) chunk: EcmascriptChunkVc,
    pub(super) chunk_group: Option<ChunkGroupVc>,
    pub(super) evaluated_entries: Option<EcmascriptChunkPlaceablesVc>,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkContentVc {
    #[turbo_tasks::function]
    pub(crate) async fn new(
        chunk: EcmascriptChunkVc,
        chunking_context: EcmascriptChunkingContextVc,
        chunk_group: Option<ChunkGroupVc>,
        evaluated_entries: Option<EcmascriptChunkPlaceablesVc>,
    ) -> Result<Self> {
        let chunk_content = chunk.chunk_content();
        let entries = EcmascriptDevChunkContentEntriesVc::new(chunk_content)
            .resolve()
            .await?;
        Ok(EcmascriptDevChunkContent {
            entries,
            chunking_context,
            chunk,
            chunk_group,
            evaluated_entries,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkContentVc {
    #[turbo_tasks::function]
    pub(crate) async fn own_version(self) -> Result<EcmascriptDevChunkVersionVc> {
        let this = self.await?;
        Ok(EcmascriptDevChunkVersionVc::new(
            this.chunking_context.output_root(),
            this.chunk.path(),
            this.entries,
        ))
    }

    #[turbo_tasks::function]
    async fn params(self, evaluated_entries: EcmascriptChunkPlaceablesVc) -> Result<CodeVc> {
        let this = self.await?;
        let chunk_group = this
            .chunk_group
            .unwrap_or_else(|| ChunkGroupVc::from_chunk(this.chunk.into()));

        let output_root = this.chunking_context.output_root().await?;

        let chunks_in_chunk_group = chunk_group.chunks().await?;
        let mut other_chunks = Vec::with_capacity(chunks_in_chunk_group.len());

        let chunk_path = this.chunk.path().await?;
        let chunk_path = if let Some(chunk_path) = output_root.get_path_to(&chunk_path) {
            chunk_path
        } else {
            bail!(
                "Could not get server path for origin chunk {}",
                chunk_path.to_string()
            );
        };

        for other_chunk in chunks_in_chunk_group.iter() {
            let other_chunk_path = &*other_chunk.path().await?;
            if let Some(other_chunk_path) = output_root.get_path_to(other_chunk_path) {
                if other_chunk_path != chunk_path {
                    other_chunks.push(other_chunk_path.to_string());
                }
            }
        }

        let runtime_module_ids = evaluated_entries
            .await?
            .iter()
            .map(|entry| entry.as_chunk_item(this.chunking_context).id())
            .try_join()
            .await?;

        let chunk_list_path = match this.chunk_group {
            Some(chunk_group) => Some(
                output_root
                    .get_path_to(&*chunk_group.chunk_list_path().await?)
                    .map(ToString::to_string)
                    .context("chunk list path is not in output root")?,
            ),
            None => None,
        };

        let params = EcmascriptDevChunkRuntimeParams {
            chunk_list_path,
            other_chunks,
            runtime_module_ids,
        };

        let mut code = CodeBuilder::default();

        write!(code, "{:#}", StringifyJs(&params))?;

        Ok(CodeVc::cell(code.build()))
    }

    #[turbo_tasks::function]
    async fn runtime(self) -> Result<CodeVc> {
        let this = self.await?;
        let mut code = CodeBuilder::default();

        // When a chunk is executed, it will either register itself with the current
        // instance of the runtime, or it will push itself onto the list of pending
        // chunks (`self.TURBOPACK`).
        //
        // When the runtime executes, it will pick up and register all pending chunks,
        // and replace the list of pending chunks with itself so later chunks can
        // register directly with it.
        writedoc!(
            code,
            r#"
                (() => {{
                if (!Array.isArray(globalThis.TURBOPACK)) {{
                    return;
                }}
            "#,
        )?;

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

        let shared_runtime_code = embed_file!("js/src/runtime.js").await?;

        match &*shared_runtime_code {
            FileContent::NotFound => bail!("shared runtime code is not found"),
            FileContent::Content(file) => code.push_source(file.content(), None),
        };

        writedoc!(
            code,
            r#"
                }})();
            "#
        )?;

        Ok(CodeVc::cell(code.build()))
    }

    #[turbo_tasks::function]
    async fn code(self) -> Result<CodeVc> {
        let this = self.await?;
        let output_root = this.chunking_context.output_root().await?;
        let chunk_path = this.chunk.path().await?;
        let chunk_server_path = if let Some(path) = output_root.get_path_to(&chunk_path) {
            path
        } else {
            bail!(
                "chunk path {} is not in output root {}",
                chunk_path.to_string(),
                output_root.to_string()
            );
        };
        let mut code = CodeBuilder::default();

        writedoc!(
            code,
            r#"
                (globalThis.TURBOPACK = globalThis.TURBOPACK || []).push([{chunk_path}, {{
            "#,
            chunk_path = StringifyJs(chunk_server_path)
        )?;

        for (id, entry) in this.entries.await?.iter() {
            write!(code, "\n{}: ", StringifyJs(&id))?;
            code.push_code(&*entry.code.await?);
            write!(code, ",")?;
        }

        write!(code, "\n}}")?;

        // Only include params when we're evaluating the current chunk.
        if let Some(evaluated_entries) = this.evaluated_entries {
            write!(code, "\n,")?;
            let params = self.params(evaluated_entries).await?;
            code.push_code(&params);
        }

        writeln!(code, "]);")?;

        // Only include the runtime code when we're evaluating the current chunk.
        if this.evaluated_entries.is_some() {
            writeln!(code)?;
            let runtime = self.runtime().await?;
            code.push_code(&runtime);
        }

        if code.has_source_map() {
            let filename = chunk_path.file_name();
            write!(code, "\n\n//# sourceMappingURL={}.map", filename)?;
        }

        Ok(code.build().cell())
    }

    #[turbo_tasks::function]
    async fn content(self) -> Result<AssetContentVc> {
        let code = self.code().await?;
        Ok(File::from(code.source_code().clone()).into())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptDevChunkContent {
    #[turbo_tasks::function]
    fn content(self_vc: EcmascriptDevChunkContentVc) -> AssetContentVc {
        self_vc.content()
    }

    #[turbo_tasks::function]
    fn version(self_vc: EcmascriptDevChunkContentVc) -> VersionVc {
        self_vc.own_version().into()
    }

    #[turbo_tasks::function]
    fn update(_self_vc: EcmascriptDevChunkContentVc, _from_version: VersionVc) -> Result<UpdateVc> {
        bail!("EcmascriptDevChunkContent is not updateable")
    }
}

#[turbo_tasks::value_impl]
impl MergeableVersionedContent for EcmascriptDevChunkContent {
    #[turbo_tasks::function]
    fn get_merger(&self) -> VersionedContentMergerVc {
        EcmascriptDevChunkContentMergerVc::new().into()
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptDevChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: EcmascriptDevChunkContentVc) -> OptionSourceMapVc {
        self_vc.code().generate_source_map()
    }

    #[turbo_tasks::function]
    async fn by_section(&self, section: &str) -> Result<OptionSourceMapVc> {
        // Weirdly, the ContentSource will have already URL decoded the ModuleId, and we
        // can't reparse that via serde.
        if let Ok(id) = ModuleId::parse(section) {
            for (entry_id, entry) in self.entries.await?.iter() {
                if id == **entry_id {
                    let sm = entry.code.generate_source_map();
                    return Ok(sm);
                }
            }
        }

        Ok(OptionSourceMapVc::cell(None))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkRuntimeContent for EcmascriptDevChunkContent {}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct EcmascriptDevChunkRuntimeParams {
    /// Other chunks in the chunk group this chunk belongs to, if any. Does not
    /// include the chunk itself.
    ///
    /// These chunks must be loaed before the runtime modules can be
    /// instantiated.
    other_chunks: Vec<String>,
    /// List of module IDs that this chunk should instantiate when executed.
    runtime_module_ids: Vec<ModuleIdReadRef>,
    /// Path to the chunk list that this chunk should register itself with.
    chunk_list_path: Option<String>,
}
