use std::io::Write as _;

use anyhow::{anyhow, bail, Result};
use indexmap::IndexSet;
use indoc::{indoc, writedoc};
use turbo_tasks::TryJoinIterExt;
use turbo_tasks_fs::{embed_file, File, FileContent, FileSystemPathReadRef, FileSystemPathVc};
use turbopack_core::{
    asset::AssetContentVc,
    chunk::{
        chunk_content, chunk_content_split, ChunkContentResult, ChunkGroupVc, ChunkVc,
        ChunkingContext, ChunkingContextVc, ModuleId,
    },
    code_builder::{CodeBuilder, CodeVc},
    environment::{ChunkLoading, EnvironmentVc},
    reference::AssetReferenceVc,
    source_map::{GenerateSourceMap, GenerateSourceMapVc, OptionSourceMapVc, SourceMapVc},
    version::{UpdateVc, VersionVc, VersionedContent, VersionedContentVc},
};

use super::{
    evaluate::EcmascriptChunkContentEvaluateVc,
    item::{EcmascriptChunkItemVc, EcmascriptChunkItems, EcmascriptChunkItemsVc},
    placeable::{EcmascriptChunkPlaceableVc, EcmascriptChunkPlaceablesVc},
    snapshot::EcmascriptChunkContentEntriesSnapshotReadRef,
    update::update_ecmascript_chunk,
    version::{EcmascriptChunkVersion, EcmascriptChunkVersionVc},
};
use crate::utils::stringify_js;

#[turbo_tasks::value]
pub struct EcmascriptChunkContentResult {
    pub chunk_items: EcmascriptChunkItemsVc,
    pub chunks: Vec<ChunkVc>,
    pub async_chunk_groups: Vec<ChunkGroupVc>,
    pub external_asset_references: Vec<AssetReferenceVc>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentResultVc {
    #[turbo_tasks::function]
    fn filter(self, _other: EcmascriptChunkContentResultVc) -> EcmascriptChunkContentResultVc {
        todo!()
    }
}

impl From<ChunkContentResult<EcmascriptChunkItemVc>> for EcmascriptChunkContentResult {
    fn from(from: ChunkContentResult<EcmascriptChunkItemVc>) -> Self {
        EcmascriptChunkContentResult {
            chunk_items: EcmascriptChunkItems(EcmascriptChunkItems::make_chunks(&from.chunk_items))
                .cell(),
            chunks: from.chunks,
            async_chunk_groups: from.async_chunk_groups,
            external_asset_references: from.external_asset_references,
        }
    }
}

#[turbo_tasks::function]
pub(crate) fn ecmascript_chunk_content(
    context: ChunkingContextVc,
    main_entries: EcmascriptChunkPlaceablesVc,
    omit_entries: Option<EcmascriptChunkPlaceablesVc>,
) -> EcmascriptChunkContentResultVc {
    let mut chunk_content = ecmascript_chunk_content_internal(context, main_entries);
    if let Some(omit_entries) = omit_entries {
        let omit_chunk_content = ecmascript_chunk_content_internal(context, omit_entries);
        chunk_content = chunk_content.filter(omit_chunk_content);
    }
    chunk_content
}

#[turbo_tasks::function]
async fn ecmascript_chunk_content_internal(
    context: ChunkingContextVc,
    entries: EcmascriptChunkPlaceablesVc,
) -> Result<EcmascriptChunkContentResultVc> {
    let entries = entries.await?;
    let entries = entries.iter().copied();

    let contents = entries
        .map(|entry| ecmascript_chunk_content_single_entry(context, entry))
        .collect::<Vec<_>>();

    if contents.len() == 1 {
        return Ok(contents.into_iter().next().unwrap());
    }

    let mut all_chunk_items = IndexSet::<EcmascriptChunkItemVc>::new();
    let mut all_chunks = IndexSet::<ChunkVc>::new();
    let mut all_async_chunk_groups = IndexSet::<ChunkGroupVc>::new();
    let mut all_external_asset_references = IndexSet::<AssetReferenceVc>::new();

    for content in contents {
        let EcmascriptChunkContentResult {
            chunk_items,
            chunks,
            async_chunk_groups,
            external_asset_references,
        } = &*content.await?;
        for chunk in chunk_items.await?.iter() {
            all_chunk_items.extend(chunk.await?.iter().copied());
        }
        all_chunks.extend(chunks.iter().copied());
        all_async_chunk_groups.extend(async_chunk_groups.iter().copied());
        all_external_asset_references.extend(external_asset_references.iter().copied());
    }

    let chunk_items =
        EcmascriptChunkItems::make_chunks(&all_chunk_items.into_iter().collect::<Vec<_>>());
    Ok(EcmascriptChunkContentResult {
        chunk_items: EcmascriptChunkItemsVc::cell(chunk_items),
        chunks: all_chunks.into_iter().collect(),
        async_chunk_groups: all_async_chunk_groups.into_iter().collect(),
        external_asset_references: all_external_asset_references.into_iter().collect(),
    }
    .cell())
}

#[turbo_tasks::function]
async fn ecmascript_chunk_content_single_entry(
    context: ChunkingContextVc,
    entry: EcmascriptChunkPlaceableVc,
) -> Result<EcmascriptChunkContentResultVc> {
    let asset = entry.as_asset();

    Ok(EcmascriptChunkContentResultVc::cell(
        if let Some(res) = chunk_content::<EcmascriptChunkItemVc>(context, asset, None).await? {
            res
        } else {
            chunk_content_split::<EcmascriptChunkItemVc>(context, asset, None).await?
        }
        .into(),
    ))
}

#[turbo_tasks::value(serialization = "none")]
pub(super) struct EcmascriptChunkContent {
    pub(super) module_factories: EcmascriptChunkContentEntriesSnapshotReadRef,
    pub(super) chunk_path: FileSystemPathReadRef,
    pub(super) output_root: FileSystemPathReadRef,
    pub(super) evaluate: Option<EcmascriptChunkContentEvaluateVc>,
    pub(super) environment: EnvironmentVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentVc {
    #[turbo_tasks::function]
    pub(super) async fn new(
        context: ChunkingContextVc,
        main_entries: EcmascriptChunkPlaceablesVc,
        omit_entries: Option<EcmascriptChunkPlaceablesVc>,
        chunk_path: FileSystemPathVc,
        evaluate: Option<EcmascriptChunkContentEvaluateVc>,
    ) -> Result<Self> {
        // TODO(alexkirsz) All of this should be done in a transition, otherwise we run
        // the risks of values not being strongly consistent with each other.
        let chunk_content = ecmascript_chunk_content(context, main_entries, omit_entries);
        let chunk_content = chunk_content.await?;
        let chunk_path = chunk_path.await?;
        let module_factories = chunk_content.chunk_items.to_entry_snapshot().await?;
        let output_root = context.output_root().await?;
        Ok(EcmascriptChunkContent {
            module_factories,
            chunk_path,
            output_root,
            evaluate,
            environment: context.environment(),
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentVc {
    #[turbo_tasks::function]
    pub(super) async fn version(self) -> Result<EcmascriptChunkVersionVc> {
        let this = self.await?;
        let chunk_server_path = if let Some(path) = this.output_root.get_path_to(&this.chunk_path) {
            path
        } else {
            bail!(
                "chunk path {} is not in output root {}",
                this.chunk_path.to_string(),
                this.output_root.to_string()
            );
        };
        let module_factories_hashes = this
            .module_factories
            .iter()
            .map(|entry| (entry.id.clone(), entry.hash))
            .collect();
        Ok(EcmascriptChunkVersion {
            module_factories_hashes,
            chunk_server_path: chunk_server_path.to_string(),
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn code(self) -> Result<CodeVc> {
        let this = self.await?;
        let chunk_server_path = if let Some(path) = this.output_root.get_path_to(&this.chunk_path) {
            path
        } else {
            bail!(
                "chunk path {} is not in output root {}",
                this.chunk_path.to_string(),
                this.output_root.to_string()
            );
        };
        let mut code = CodeBuilder::default();
        code += "(self.TURBOPACK = self.TURBOPACK || []).push([";

        writeln!(code, "{}, {{", stringify_js(chunk_server_path))?;
        for entry in &this.module_factories {
            write!(code, "\n{}: ", &stringify_js(entry.id()))?;
            code.push_code(entry.code());
            code += ",";
        }
        code += "\n}";

        if let Some(evaluate) = &this.evaluate {
            let evaluate = evaluate.await?;
            let condition = evaluate
                .ecma_chunks_server_paths
                .iter()
                .map(|path| format!(" && loadedChunks.has({})", stringify_js(path)))
                .collect::<Vec<_>>()
                .join("");
            let entries_instantiations = evaluate
                .entry_modules_ids
                .iter()
                .map(|id| async move {
                    let id = id.await?;
                    let id = stringify_js(&id);
                    Ok(format!(r#"instantiateRuntimeModule({id});"#)) as Result<_>
                })
                .try_join()
                .await?
                .join("\n");

            // Add a runnable to the chunk that requests the entry module to ensure it gets
            // executed when the chunk is evaluated.
            // The condition stops the entry module from being executed while chunks it
            // depend on have not yet been registered.
            // The runnable will run every time a new chunk is `.push`ed to TURBOPACK, until
            // all dependent chunks have been evaluated.
            writedoc!(
                code,
                r#"
                    , ({{ loadedChunks, instantiateRuntimeModule }}) => {{
                        if(!(true{condition})) return true;
                        {entries_instantiations}
                    }}
                "#
            )?;
        }
        code += "]);\n";
        if this.evaluate.is_some() {
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
                "#
            )?;

            let specific_runtime_code = match *this.environment.chunk_loading().await? {
                ChunkLoading::None => embed_file!("js/src/runtime.none.js").await?,
                ChunkLoading::NodeJs => embed_file!("js/src/runtime.nodejs.js").await?,
                ChunkLoading::Dom => embed_file!("js/src/runtime.dom.js").await?,
            };

            match &*specific_runtime_code {
                FileContent::NotFound => return Err(anyhow!("specific runtime code is not found")),
                FileContent::Content(file) => code.push_source(file.content(), None),
            };

            let shared_runtime_code = embed_file!("js/src/runtime.js").await?;

            match &*shared_runtime_code {
                FileContent::NotFound => return Err(anyhow!("shared runtime code is not found")),
                FileContent::Content(file) => code.push_source(file.content(), None),
            };

            code += indoc! { r#"
                })();
            "# };
        }

        if code.has_source_map() {
            let filename = this.chunk_path.file_name();
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
impl VersionedContent for EcmascriptChunkContent {
    #[turbo_tasks::function]
    fn content(self_vc: EcmascriptChunkContentVc) -> AssetContentVc {
        self_vc.content()
    }

    #[turbo_tasks::function]
    fn version(self_vc: EcmascriptChunkContentVc) -> VersionVc {
        self_vc.version().into()
    }

    #[turbo_tasks::function]
    fn update(self_vc: EcmascriptChunkContentVc, from_version: VersionVc) -> UpdateVc {
        update_ecmascript_chunk(self_vc, from_version)
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: EcmascriptChunkContentVc) -> SourceMapVc {
        self_vc.code().generate_source_map()
    }

    #[turbo_tasks::function]
    async fn by_section(&self, section: &str) -> Result<OptionSourceMapVc> {
        // Weirdly, the ContentSource will have already URL decoded the ModuleId, and we
        // can't reparse that via serde.
        if let Ok(id) = ModuleId::parse(section) {
            for entry in self.module_factories.iter() {
                if id == *entry.id() {
                    let sm = entry.code_vc.generate_source_map();
                    return Ok(OptionSourceMapVc::cell(Some(sm)));
                }
            }
        }

        Ok(OptionSourceMapVc::cell(None))
    }
}
