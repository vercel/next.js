use std::io::Write;

use anyhow::{bail, Result};
use indoc::writedoc;
use serde::Serialize;
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::{Asset, AssetContentVc},
    chunk::{ChunkingContext, ModuleId, ModuleIdReadRef},
    code_builder::{CodeBuilder, CodeVc},
    source_map::{GenerateSourceMap, GenerateSourceMapVc, OptionSourceMapVc},
    version::{
        MergeableVersionedContent, MergeableVersionedContentVc, UpdateVc, VersionVc,
        VersionedContent, VersionedContentMergerVc, VersionedContentVc,
    },
};
use turbopack_ecmascript::{chunk::EcmascriptChunkContentVc, utils::StringifyJs};

use super::{
    chunk::EcmascriptDevChunkVc, content_entry::EcmascriptDevChunkContentEntriesVc,
    merged::merger::EcmascriptDevChunkContentMergerVc, version::EcmascriptDevChunkVersionVc,
};
use crate::DevChunkingContextVc;

#[turbo_tasks::value(serialization = "none")]
pub(super) struct EcmascriptDevChunkContent {
    pub(super) entries: EcmascriptDevChunkContentEntriesVc,
    pub(super) chunking_context: DevChunkingContextVc,
    pub(super) chunk: EcmascriptDevChunkVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkContentVc {
    #[turbo_tasks::function]
    pub(crate) async fn new(
        chunking_context: DevChunkingContextVc,
        chunk: EcmascriptDevChunkVc,
        content: EcmascriptChunkContentVc,
    ) -> Result<Self> {
        let entries = EcmascriptDevChunkContentEntriesVc::new(content)
            .resolve()
            .await?;
        Ok(EcmascriptDevChunkContent {
            entries,
            chunking_context,
            chunk,
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
            this.chunk.ident().path(),
            this.entries,
        ))
    }

    #[turbo_tasks::function]
    async fn code(self) -> Result<CodeVc> {
        let this = self.await?;
        let output_root = this.chunking_context.output_root().await?;
        let chunk_path = this.chunk.ident().path().await?;
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

        // When a chunk is executed, it will either register itself with the current
        // instance of the runtime, or it will push itself onto the list of pending
        // chunks (`self.TURBOPACK`).
        //
        // When the runtime executes (see the `evaluate` module), it will pick up and
        // register all pending chunks, and replace the list of pending chunks
        // with itself so later chunks can register directly with it.
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

        write!(code, "\n}}]);")?;

        if code.has_source_map() {
            let filename = chunk_path.file_name();
            write!(code, "\n\n//# sourceMappingURL={}.map", filename)?;
        }

        Ok(code.build().cell())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptDevChunkContent {
    #[turbo_tasks::function]
    async fn content(self_vc: EcmascriptDevChunkContentVc) -> Result<AssetContentVc> {
        let code = self_vc.code().await?;
        Ok(File::from(code.source_code().clone()).into())
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
