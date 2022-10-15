pub mod loader;
pub(crate) mod source_map;

use std::{fmt::Write as _, slice::Iter};

use anyhow::{anyhow, Context, Result};
use indexmap::{IndexMap, IndexSet};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{StringVc, StringsVc},
    trace::TraceRawVcs,
    TryJoinIterExt, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{embed_file, File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc, AssetsVc},
    chunk::{
        chunk_content, chunk_content_split, Chunk, ChunkContentResult, ChunkGroupReferenceVc,
        ChunkGroupVc, ChunkItem, ChunkItemVc, ChunkReferenceVc, ChunkVc, ChunkableAsset,
        ChunkableAssetVc, ChunkingContextVc, FromChunkableAsset, ModuleId, ModuleIdReadRef,
        ModuleIdVc, ModuleIdsVc,
    },
    code_builder::{Code, CodeReadRef, CodeVc},
    reference::{AssetReferenceVc, AssetReferencesVc},
    version::{
        PartialUpdate, Update, UpdateVc, Version, VersionVc, VersionedContent, VersionedContentVc,
    },
};
use turbopack_hash::{encode_hex, hash_xxh3_hash64, Xxh3Hash64Hasher};

use self::{
    loader::{ManifestChunkAssetVc, ManifestLoaderItemVc},
    source_map::EcmascriptChunkSourceMapAssetReferenceVc,
};
use crate::{
    parse::ParseResultSourceMapVc,
    references::esm::EsmExportsVc,
    utils::{stringify_module_id, stringify_str, FormatIter},
};

#[turbo_tasks::value]
pub struct EcmascriptChunk {
    context: ChunkingContextVc,
    main_entry: EcmascriptChunkPlaceableVc,
    evaluate: Option<EcmascriptChunkEvaluate>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkVc {
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, main_entry: EcmascriptChunkPlaceableVc) -> Self {
        Self::cell(EcmascriptChunk {
            context,
            main_entry,
            evaluate: None,
        })
    }

    #[turbo_tasks::function]
    pub fn new_evaluate(
        context: ChunkingContextVc,
        main_entry: EcmascriptChunkPlaceableVc,
        runtime_entries: Option<EcmascriptChunkPlaceablesVc>,
    ) -> Self {
        Self::cell(EcmascriptChunk {
            context,
            main_entry,
            evaluate: Some(EcmascriptChunkEvaluate { runtime_entries }),
        })
    }
}

/// Whether the ES chunk should include and evaluate a runtime.
#[derive(PartialEq, Eq, Debug, Clone, TraceRawVcs, Serialize, Deserialize)]
pub struct EcmascriptChunkEvaluate {
    /// Runtime entry modules will be instantiated before the main entry.
    /// They are useful for applications such as polyfills or hot
    /// module runtimes.
    runtime_entries: Option<EcmascriptChunkPlaceablesVc>,
}

#[turbo_tasks::value]
pub struct EcmascriptChunkContentResult {
    pub chunk_items: EcmascriptChunkItemsVc,
    pub chunks: Vec<ChunkVc>,
    pub async_chunk_groups: Vec<ChunkGroupVc>,
    pub external_asset_references: Vec<AssetReferenceVc>,
}

impl From<ChunkContentResult<EcmascriptChunkItemVc>> for EcmascriptChunkContentResult {
    fn from(from: ChunkContentResult<EcmascriptChunkItemVc>) -> Self {
        EcmascriptChunkContentResult {
            chunk_items: EcmascriptChunkItems(from.chunk_items).cell(),
            chunks: from.chunks,
            async_chunk_groups: from.async_chunk_groups,
            external_asset_references: from.external_asset_references,
        }
    }
}
#[turbo_tasks::function]
async fn ecmascript_chunk_content(
    context: ChunkingContextVc,
    entry: EcmascriptChunkPlaceableVc,
    runtime_entries: Option<EcmascriptChunkPlaceablesVc>,
) -> Result<EcmascriptChunkContentResultVc> {
    let entry = entry.as_asset();
    let runtime_entries = runtime_entries.map(|runtime_entries| runtime_entries.as_assets());

    Ok(EcmascriptChunkContentResultVc::cell(
        if let Some(res) =
            chunk_content::<EcmascriptChunkItemVc>(context, entry, runtime_entries).await?
        {
            res
        } else {
            chunk_content_split::<EcmascriptChunkItemVc>(context, entry, runtime_entries).await?
        }
        .into(),
    ))
}

#[turbo_tasks::value(serialization = "none")]
pub struct EcmascriptChunkContent {
    module_factories: EcmascriptChunkContentEntriesSnapshotReadRef,
    chunk_path: FileSystemPathVc,
    evaluate: Option<EcmascriptChunkContentEvaluateVc>,
}

#[turbo_tasks::value(transparent)]
struct EcmascriptChunkContentEntries(Vec<EcmascriptChunkContentEntryVc>);

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentEntriesVc {
    #[turbo_tasks::function]
    async fn snapshot(self) -> Result<EcmascriptChunkContentEntriesSnapshotVc> {
        Ok(EcmascriptChunkContentEntriesSnapshot::List(
            self.await?.iter().copied().try_join().await?,
        )
        .cell())
    }
}

/// This is a snapshot of a list of EcmascriptChunkContentEntry represented as
/// tree of ReadRefs.
///
/// A tree is used instead of a plain Vec to allow to reused cached parts of the
/// list when it only a few elements have changed
#[turbo_tasks::value(serialization = "none")]
enum EcmascriptChunkContentEntriesSnapshot {
    List(Vec<EcmascriptChunkContentEntryReadRef>),
    Nested(Vec<EcmascriptChunkContentEntriesSnapshotReadRef>),
}

impl EcmascriptChunkContentEntriesSnapshot {
    fn iter(&self) -> EcmascriptChunkContentEntriesSnapshotIterator {
        match self {
            EcmascriptChunkContentEntriesSnapshot::List(l) => {
                EcmascriptChunkContentEntriesSnapshotIterator::List(l.iter())
            }
            EcmascriptChunkContentEntriesSnapshot::Nested(n) => {
                let mut it = n.iter();
                if let Some(inner) = it.next() {
                    EcmascriptChunkContentEntriesSnapshotIterator::Nested(
                        Box::new(inner.iter()),
                        it,
                    )
                } else {
                    EcmascriptChunkContentEntriesSnapshotIterator::Empty
                }
            }
        }
    }
}

impl<'a> IntoIterator for &'a EcmascriptChunkContentEntriesSnapshot {
    type Item = &'a EcmascriptChunkContentEntryReadRef;

    type IntoIter = EcmascriptChunkContentEntriesSnapshotIterator<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

enum EcmascriptChunkContentEntriesSnapshotIterator<'a> {
    Empty,
    List(Iter<'a, EcmascriptChunkContentEntryReadRef>),
    Nested(
        Box<EcmascriptChunkContentEntriesSnapshotIterator<'a>>,
        Iter<'a, EcmascriptChunkContentEntriesSnapshotReadRef>,
    ),
}

impl<'a> Iterator for EcmascriptChunkContentEntriesSnapshotIterator<'a> {
    type Item = &'a EcmascriptChunkContentEntryReadRef;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            EcmascriptChunkContentEntriesSnapshotIterator::Empty => None,
            EcmascriptChunkContentEntriesSnapshotIterator::List(i) => i.next(),
            EcmascriptChunkContentEntriesSnapshotIterator::Nested(inner, i) => loop {
                if let Some(r) = inner.next() {
                    return Some(r);
                }
                if let Some(new) = i.next() {
                    **inner = new.iter();
                } else {
                    return None;
                }
            },
        }
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentVc {
    #[turbo_tasks::function]
    async fn new(
        context: ChunkingContextVc,
        main_entry: EcmascriptChunkPlaceableVc,
        runtime_entries: Option<EcmascriptChunkPlaceablesVc>,
        chunk_path: FileSystemPathVc,
        evaluate: Option<EcmascriptChunkContentEvaluateVc>,
    ) -> Result<Self> {
        // TODO(alexkirsz) All of this should be done in a transition, otherwise we run
        // the risks of values not being strongly consistent with each other.
        let chunk_content = ecmascript_chunk_content(context, main_entry, runtime_entries).await?;
        let module_factories = chunk_content.chunk_items.to_entry_snapshot().await?;
        Ok(EcmascriptChunkContent {
            module_factories,
            chunk_path,
            evaluate,
        }
        .cell())
    }
}

#[turbo_tasks::value(serialization = "none")]
struct EcmascriptChunkContentEntry {
    chunk_item: EcmascriptChunkItemVc,
    id: ModuleIdReadRef,
    code: CodeReadRef,
    code_vc: CodeVc,
    hash: u64,
}

impl EcmascriptChunkContentEntry {
    fn id(&self) -> &ModuleId {
        &self.id
    }

    fn code(&self) -> &Code {
        &self.code
    }

    fn source_code(&self) -> &str {
        self.code.source_code()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentEntryVc {
    #[turbo_tasks::function]
    async fn new(chunk_item: EcmascriptChunkItemVc) -> Result<Self> {
        let content = chunk_item.content();
        let factory = module_factory(content);
        let id = chunk_item.id().await?;
        let code = factory.await?;
        let hash = hash_xxh3_hash64(code.source_code().as_bytes());
        Ok(EcmascriptChunkContentEntry {
            chunk_item,
            id,
            code,
            code_vc: factory,
            hash,
        }
        .cell())
    }
}

#[turbo_tasks::function]
async fn module_factory(content: EcmascriptChunkItemContentVc) -> Result<CodeVc> {
    let content = content.await?;
    let mut args = vec![
        "r: __turbopack_require__",
        "i: __turbopack_import__",
        "s: __turbopack_esm__",
        "v: __turbopack_export_value__",
        "c: __turbopack_cache__",
        "l: __turbopack_load__",
        "p: process",
    ];
    if content.options.module {
        args.push("m: module");
    }
    if content.options.exports {
        args.push("e: exports");
    }
    let mut code = Code::new();
    let args = FormatIter(|| args.iter().copied().intersperse(", "));
    if content.options.this {
        write!(code, "(function({{ {} }}) {{ !function() {{\n\n", args,)?;
    } else {
        write!(code, "(({{ {} }}) => (() => {{\n\n", args,)?;
    }
    let source_map = content.source_map.map(|sm| sm.as_encoded_source_map());
    code.push_source(&content.inner_code, source_map);
    if content.options.this {
        code += "\n}.call(this) })";
    } else {
        code += "\n})())";
    }
    Ok(code.cell())
}

#[derive(Serialize)]
struct EcmascriptChunkUpdate<'a> {
    added: IndexMap<&'a ModuleId, HmrUpdateEntry<'a>>,
    modified: IndexMap<&'a ModuleId, HmrUpdateEntry<'a>>,
    deleted: IndexSet<&'a ModuleId>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentVc {
    #[turbo_tasks::function]
    async fn version(self) -> Result<EcmascriptChunkVersionVc> {
        let module_factories_hashes = self
            .await?
            .module_factories
            .iter()
            .map(|entry| (entry.id.clone(), entry.hash))
            .collect();
        Ok(EcmascriptChunkVersion {
            module_factories_hashes,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn code(self) -> Result<CodeVc> {
        let this = self.await?;
        let mut code = Code::new();
        let chunk_path = this.chunk_path.await?;
        let chunk_id = this.chunk_path.to_string().await?;
        writeln!(
            code,
            "(self.TURBOPACK = self.TURBOPACK || []).push([{}, {{",
            stringify_str(&chunk_id)
        )?;
        for entry in &this.module_factories {
            write!(code, "\n{}: ", &stringify_module_id(entry.id()))?;
            code.push_code(entry.code());
            code += ",";
        }
        code += "\n}";
        if let Some(evaluate) = &this.evaluate {
            let evaluate = evaluate.await?;
            let condition = evaluate
                .chunks_ids
                .await?
                .iter()
                .map(|id| format!(" && chunks.has({})", stringify_str(id)))
                .collect::<Vec<_>>()
                .join("");
            let entries_ids = &*evaluate.entry_modules_ids.await?;
            let entries_instantiations = entries_ids
                .iter()
                .map(|id| async move {
                    let id = id.await?;
                    let id = stringify_module_id(&id);
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
            write!(
                code,
                ", ({{ chunks, instantiateRuntimeModule }}) => {{
    if(!(true{condition})) return true;
    {entries_instantiations}
}}"
            )?;
        }
        code += "]);\n";
        if let Some(evaluate) = &this.evaluate {
            let runtime_code = evaluate.await?.runtime_code.await?;
            let runtime_code = match &*runtime_code {
                FileContent::NotFound => return Err(anyhow!("runtime code is not found")),
                FileContent::Content(file) => String::from_utf8(file.content().to_vec())
                    .context("runtime code is invalid UTF-8")?,
            };
            // Add the turbopack runtime to the chunk.
            code += runtime_code.as_str();
        }

        if code.has_source_map() {
            let filename = chunk_path.file_name();
            let version = self.version().id().await?;
            write!(
                code,
                "\n\n//# sourceMappingURL={}.{}.map",
                filename, version
            )?;
        }

        Ok(code.cell())
    }

    #[turbo_tasks::function]
    async fn content(self) -> Result<AssetContentVc> {
        let code = self.code().source_code().await?;
        Ok(File::from(code).into())
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
    async fn update(
        self_vc: EcmascriptChunkContentVc,
        from_version: VersionVc,
    ) -> Result<UpdateVc> {
        let from_version = EcmascriptChunkVersionVc::resolve_from(from_version)
            .await?
            .expect("version must be an `EcmascriptChunkVersionVc`");
        let to_version = self_vc.version();

        let to = to_version.await?;
        let from = from_version.await?;

        // When to and from point to the same value we can skip comparing them.
        // This will happen since `cell_local` will not clone the value, but only make
        // the local cell point to the same immutable value (Arc).
        if from.ptr_eq(&to) {
            return Ok(Update::None.cell());
        }

        let this = self_vc.await?;
        let chunk_path = &this.chunk_path.await?.path;

        // TODO(alexkirsz) This should probably be stored as a HashMap already.
        let mut module_factories: IndexMap<_, _> = this
            .module_factories
            .iter()
            .map(|entry| (entry.id(), entry))
            .collect();
        let mut added = IndexMap::new();
        let mut modified = IndexMap::new();
        let mut deleted = IndexSet::new();

        for (id, hash) in &from.module_factories_hashes {
            let id = &**id;
            if let Some(entry) = module_factories.remove(id) {
                if entry.hash != *hash {
                    modified.insert(id, HmrUpdateEntry::new(entry, chunk_path));
                }
            } else {
                deleted.insert(id);
            }
        }

        // Remaining entries are added
        for (id, entry) in module_factories {
            added.insert(id, HmrUpdateEntry::new(entry, chunk_path));
        }

        let update = if added.is_empty() && modified.is_empty() && deleted.is_empty() {
            Update::None
        } else {
            let chunk_update = EcmascriptChunkUpdate {
                added,
                modified,
                deleted,
            };

            Update::Partial(PartialUpdate {
                to: to_version.into(),
                instruction: StringVc::cell(serde_json::to_string(&chunk_update)?),
            })
        };

        Ok(update.into())
    }
}

#[derive(serde::Serialize)]
struct HmrUpdateEntry<'a> {
    code: &'a str,
    map: Option<String>,
}

impl<'a> HmrUpdateEntry<'a> {
    fn new(entry: &'a EcmascriptChunkContentEntry, chunk_path: &str) -> Self {
        HmrUpdateEntry {
            code: entry.source_code(),
            map: entry
                .code
                .has_source_map()
                .then(|| format!("{}.{}.map", chunk_path, encode_hex(entry.hash))),
        }
    }
}

#[turbo_tasks::value(serialization = "none")]
struct EcmascriptChunkVersion {
    module_factories_hashes: IndexMap<ModuleIdReadRef, u64>,
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptChunkVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<StringVc> {
        let sorted_hashes = {
            let mut versions: Vec<_> = self.module_factories_hashes.values().copied().collect();
            versions.sort();
            versions
        };
        let mut hasher = Xxh3Hash64Hasher::new();
        for hash in sorted_hashes {
            hasher.write(&hash.to_le_bytes());
        }
        let hash = hasher.finish();
        let hex_hash = encode_hex(hash);
        Ok(StringVc::cell(hex_hash))
    }
}

#[turbo_tasks::value_impl]
impl Chunk for EcmascriptChunk {}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        use std::future::IntoFuture;

        let suffix = match self.evaluate {
            None => "".to_string(),
            Some(EcmascriptChunkEvaluate {
                runtime_entries: None,
            }) => " (evaluate)".to_string(),
            Some(EcmascriptChunkEvaluate {
                runtime_entries: Some(runtime_entries),
            }) => {
                let runtime_entries_ids = runtime_entries
                    .await?
                    .iter()
                    .map(|entry| entry.path().to_string().into_future())
                    .try_join()
                    .await?;
                let runtime_entries_ids_str = runtime_entries_ids
                    .iter()
                    .map(|s| s.as_ref())
                    .collect::<Vec<_>>();
                let runtime_entries_ids_str = runtime_entries_ids_str.join(", ");
                format!(
                    " (evaluate) with runtime entries: {}",
                    runtime_entries_ids_str
                )
            }
        };

        Ok(StringVc::cell(format!(
            "chunk {}{}",
            self.main_entry.path().to_string().await?,
            suffix
        )))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkVc {
    #[turbo_tasks::function]
    async fn chunk_content(self) -> Result<EcmascriptChunkContentVc> {
        let this = self.await?;
        let (evaluate, runtime_entries) = match this.evaluate {
            None => (None, None),
            Some(EcmascriptChunkEvaluate { runtime_entries }) => {
                let evaluate_chunks = ChunkGroupVc::from_chunk(self.into()).chunks().await?;
                let mut chunks_ids = Vec::new();
                for c in evaluate_chunks.iter() {
                    if let Some(ecma_chunk) = EcmascriptChunkVc::resolve_from(c).await? {
                        if ecma_chunk != self {
                            chunks_ids.push(c.path().to_string().await?.clone_value());
                        }
                    }
                }
                let context = this.context;
                let mut entry_modules_ids = if let Some(runtime_entries) = runtime_entries {
                    runtime_entries
                        .await?
                        .iter()
                        .map(|entry| entry.as_chunk_item(context).id())
                        .collect()
                } else {
                    vec![]
                };
                entry_modules_ids.push(this.main_entry.as_chunk_item(context).id());
                (
                    Some(EcmascriptChunkContentEvaluateVc::cell(
                        EcmascriptChunkContentEvaluate {
                            chunks_ids: StringsVc::cell(chunks_ids),
                            entry_modules_ids: ModuleIdsVc::cell(entry_modules_ids),
                            runtime_code: embed_file!("src/chunk/runtime.js"),
                        },
                    )),
                    runtime_entries,
                )
            }
        };
        let chunk_id = self.path();
        let content = EcmascriptChunkContentVc::new(
            this.context,
            this.main_entry,
            runtime_entries,
            chunk_id,
            evaluate,
        );
        Ok(content)
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<FileSystemPathVc> {
        // Avoid collisions between evaluated and non-evaluated chunks.
        let path = if let Some(EcmascriptChunkEvaluate { runtime_entries }) = self.evaluate {
            if let Some(runtime_entries) = runtime_entries {
                let mut hasher = Xxh3Hash64Hasher::new();
                for entry in &*runtime_entries.await? {
                    let path = entry.path().to_string().await?;
                    hasher.write(path.as_bytes());
                }
                let hash = hasher.finish();
                self.main_entry
                    .path()
                    .append(&format!(".eval{}", encode_hex(hash)))
            } else {
                self.main_entry.path().append(".eval")
            }
        } else {
            self.main_entry.path()
        };

        Ok(self.context.chunk_path(path, ".js"))
    }

    #[turbo_tasks::function]
    fn content(self_vc: EcmascriptChunkVc) -> AssetContentVc {
        self_vc.chunk_content().content()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: EcmascriptChunkVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let content = ecmascript_chunk_content(
            this.context,
            this.main_entry,
            this.evaluate
                .as_ref()
                .and_then(|EcmascriptChunkEvaluate { runtime_entries }| *runtime_entries),
        )
        .await?;
        let mut references = Vec::new();
        for r in content.external_asset_references.iter() {
            references.push(*r);
        }
        for chunk in content.chunks.iter() {
            references.push(ChunkReferenceVc::new_parallel(*chunk).into());
        }
        for chunk_group in content.async_chunk_groups.iter() {
            references.push(ChunkGroupReferenceVc::new(*chunk_group).into());
        }

        references.push(
            EcmascriptChunkSourceMapAssetReferenceVc::new(
                self_vc,
                *this.context.is_hot_module_replacement_enabled().await?,
            )
            .into(),
        );

        Ok(AssetReferencesVc::cell(references))
    }

    #[turbo_tasks::function]
    fn versioned_content(self_vc: EcmascriptChunkVc) -> VersionedContentVc {
        self_vc.chunk_content().into()
    }
}

#[turbo_tasks::value]
struct EcmascriptChunkContentEvaluate {
    chunks_ids: StringsVc,
    entry_modules_ids: ModuleIdsVc,
    runtime_code: FileContentVc,
}

#[turbo_tasks::value]
pub struct EcmascriptChunkContext {
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContextVc {
    #[turbo_tasks::function]
    pub fn of(context: ChunkingContextVc) -> EcmascriptChunkContextVc {
        EcmascriptChunkContextVc::cell(EcmascriptChunkContext { context })
    }

    #[turbo_tasks::function]
    pub async fn chunk_item_id(self, chunk_item: EcmascriptChunkItemVc) -> Result<ModuleIdVc> {
        let layer = &*self.await?.context.layer().await?;
        let mut s = chunk_item.to_string().await?.clone_value();
        if !layer.is_empty() {
            if s.ends_with(')') {
                s.pop();
                write!(s, ", {layer})")?;
            } else {
                write!(s, " ({layer})")?;
            }
        }
        Ok(ModuleId::String(s).cell())
    }
}

#[turbo_tasks::value(shared)]
pub enum EcmascriptExports {
    EsmExports(EsmExportsVc),
    CommonJs,
    Value,
    None,
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkPlaceable: ChunkableAsset + Asset {
    fn as_chunk_item(&self, context: ChunkingContextVc) -> EcmascriptChunkItemVc;
    fn get_exports(&self) -> EcmascriptExportsVc;
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkPlaceables(Vec<EcmascriptChunkPlaceableVc>);

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceablesVc {
    #[turbo_tasks::function]
    async fn as_assets(self) -> Result<AssetsVc> {
        Ok(AssetsVc::cell(
            self.await?.iter().map(|p| p.as_asset()).collect(),
        ))
    }
}

#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct EcmascriptChunkItemContent {
    pub inner_code: String,
    pub source_map: Option<ParseResultSourceMapVc>,
    pub options: EcmascriptChunkItemOptions,
    pub placeholder_for_future_extensions: (),
}

#[derive(PartialEq, Eq, Default, Debug, Clone, Serialize, Deserialize, TraceRawVcs)]
pub struct EcmascriptChunkItemOptions {
    pub module: bool,
    pub exports: bool,
    pub this: bool,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkItem: ChunkItem + ValueToString {
    fn content(&self) -> EcmascriptChunkItemContentVc;
    fn chunking_context(&self) -> ChunkingContextVc;
    fn id(&self) -> ModuleIdVc {
        EcmascriptChunkContextVc::of(self.chunking_context()).chunk_item_id(*self)
    }
}

#[async_trait::async_trait]
impl FromChunkableAsset for EcmascriptChunkItemVc {
    async fn from_asset(context: ChunkingContextVc, asset: AssetVc) -> Result<Option<Self>> {
        if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
            return Ok(Some(placeable.as_chunk_item(context)));
        }
        Ok(None)
    }

    async fn from_async_asset(
        context: ChunkingContextVc,
        asset: ChunkableAssetVc,
    ) -> Result<Option<(Self, ChunkableAssetVc)>> {
        let chunk = ManifestChunkAssetVc::new(asset, context);
        Ok(Some((
            ManifestLoaderItemVc::new(context, chunk).into(),
            chunk.into(),
        )))
    }
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkItems(Vec<EcmascriptChunkItemVc>);

/// Maximum length of a Vec that is processed in only function. Longer lists
/// will be split into LIST_CHUNK_COUNT shorter lists.
const MAX_SHORT_LIST_LEN: usize = 100;

/// Number of segments in which a long list is split. It's a trade-off between
/// overhead of managing more functions (small values) and overhead of managing
/// more function calls per function (large values)
const LIST_CHUNK_COUNT: usize = 10;

#[turbo_tasks::value_impl]
impl EcmascriptChunkItemsVc {
    #[turbo_tasks::function]
    async fn to_entry_snapshot(self) -> Result<EcmascriptChunkContentEntriesSnapshotVc> {
        let list = self.await?;
        if list.len() > MAX_SHORT_LIST_LEN {
            let chunk_size = list.len().div_ceil(LIST_CHUNK_COUNT);
            Ok(EcmascriptChunkContentEntriesSnapshot::Nested(
                list.chunks(chunk_size)
                    .map(|chunk| {
                        EcmascriptChunkItems(chunk.to_vec())
                            .cell()
                            .to_entry_snapshot()
                    })
                    .try_join()
                    .await?,
            )
            .cell())
        } else {
            Ok(EcmascriptChunkContentEntries(
                list.iter()
                    .map(|chunk_item| EcmascriptChunkContentEntryVc::new(*chunk_item))
                    .collect(),
            )
            .cell()
            .snapshot())
        }
    }
}
