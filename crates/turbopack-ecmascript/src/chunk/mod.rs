pub mod loader;
pub(crate) mod optimize;
pub mod source_map;

use std::{fmt::Write, io::Write as _, slice::Iter};

use anyhow::{anyhow, bail, Result};
use indexmap::{IndexMap, IndexSet};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{JsonValueVc, StringReadRef, StringVc, StringsVc, UsizeVc},
    trace::TraceRawVcs,
    TryJoinIterExt, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{
    embed_file, rope::Rope, File, FileContent, FileSystemPathOptionVc, FileSystemPathVc,
};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        chunk_content, chunk_content_split,
        optimize::{ChunkOptimizerVc, OptimizableChunk, OptimizableChunkVc},
        Chunk, ChunkContentResult, ChunkGroupReferenceVc, ChunkGroupVc, ChunkItem, ChunkItemVc,
        ChunkReferenceVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc,
        FromChunkableAsset, ModuleId, ModuleIdReadRef, ModuleIdVc, ModuleIdsVc,
    },
    code_builder::{Code, CodeBuilder, CodeReadRef, CodeVc},
    introspect::{
        asset::{children_from_asset_references, content_to_details, IntrospectableAssetVc},
        Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    reference::{AssetReferenceVc, AssetReferencesVc},
    source_map::{GenerateSourceMap, GenerateSourceMapVc, SourceMapVc},
    version::{
        PartialUpdate, TotalUpdate, Update, UpdateVc, Version, VersionVc, VersionedContent,
        VersionedContentVc,
    },
};

use self::{
    loader::{ManifestChunkAssetVc, ManifestLoaderItemVc},
    optimize::EcmascriptChunkOptimizerVc,
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
    main_entries: EcmascriptChunkPlaceablesVc,
    omit_entries: Option<EcmascriptChunkPlaceablesVc>,
    evaluate: Option<EcmascriptChunkEvaluateVc>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkVc {
    #[turbo_tasks::function]
    pub fn new_normalized(
        context: ChunkingContextVc,
        main_entries: EcmascriptChunkPlaceablesVc,
        omit_entries: Option<EcmascriptChunkPlaceablesVc>,
        evaluate: Option<EcmascriptChunkEvaluateVc>,
    ) -> Self {
        EcmascriptChunk {
            context,
            main_entries,
            omit_entries,
            evaluate,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, main_entry: EcmascriptChunkPlaceableVc) -> Self {
        Self::new_normalized(
            context,
            EcmascriptChunkPlaceablesVc::cell(vec![main_entry]),
            None,
            None,
        )
    }

    #[turbo_tasks::function]
    pub async fn new_evaluate(
        context: ChunkingContextVc,
        main_entry: EcmascriptChunkPlaceableVc,
        runtime_entries: Option<EcmascriptChunkPlaceablesVc>,
    ) -> Result<Self> {
        let mut entries = Vec::new();
        if let Some(runtime_entries) = runtime_entries {
            entries.extend(runtime_entries.await?.iter().copied());
        }
        entries.push(main_entry);
        let entries = EcmascriptChunkPlaceablesVc::cell(entries);
        Ok(Self::new_normalized(
            context,
            entries,
            None,
            Some(
                EcmascriptChunkEvaluate {
                    evaluate_entries: entries,
                    chunk_group: None,
                }
                .cell(),
            ),
        ))
    }

    /// Return the most specific directory which contains all elements of the
    /// chunk.
    #[turbo_tasks::function]
    pub async fn common_parent(self) -> Result<FileSystemPathOptionVc> {
        let this = self.await?;
        let main_entries = this.main_entries.await?;
        let mut paths = main_entries.iter().map(|entry| entry.path().parent());
        let mut current = paths
            .next()
            .ok_or_else(|| anyhow!("Chunks must have at least one entry"))?
            .resolve()
            .await?;
        for path in paths {
            while !*path.is_inside_or_equal(current).await? {
                let parent = current.parent().resolve().await?;
                if parent == current {
                    return Ok(FileSystemPathOptionVc::cell(None));
                }
                current = parent;
            }
        }
        Ok(FileSystemPathOptionVc::cell(Some(current)))
    }

    #[turbo_tasks::function]
    pub async fn compare(
        left: EcmascriptChunkVc,
        right: EcmascriptChunkVc,
    ) -> Result<EcmascriptChunkComparisonVc> {
        let a = left.await?;
        let b = right.await?;

        let a = ecmascript_chunk_content(a.context, a.main_entries, a.omit_entries);
        let b = ecmascript_chunk_content(b.context, b.main_entries, b.omit_entries);

        let a = a.await?.chunk_items.to_set();
        let b = b.await?.chunk_items.to_set();

        let a = &*a.await?;
        let b = &*b.await?;

        let mut unshared_a = a.clone();
        let mut unshared_b = b.clone();
        let mut shared = IndexSet::new();
        for item in b {
            if unshared_a.remove(item) {
                shared.insert(*item);
            }
        }
        for item in &shared {
            unshared_b.remove(item);
        }
        Ok(EcmascriptChunkComparison {
            shared_chunk_items: shared.len(),
            left_chunk_items: unshared_a.len(),
            right_chunk_items: unshared_b.len(),
        }
        .cell())
    }
}

#[turbo_tasks::value]
pub struct EcmascriptChunkComparison {
    shared_chunk_items: usize,
    left_chunk_items: usize,
    right_chunk_items: usize,
}

/// Whether the ES chunk should include and evaluate a runtime.
#[turbo_tasks::value]
pub struct EcmascriptChunkEvaluate {
    /// Entries that will be executed in that order only all chunks are ready.
    /// These entries must be included in `main_entries` so that they are
    /// available.
    evaluate_entries: EcmascriptChunkPlaceablesVc,
    /// All chunks of this chunk group need to be ready for execution to start.
    /// When None, it will use a chunk group created from the current chunk.
    chunk_group: Option<ChunkGroupVc>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkEvaluateVc {
    #[turbo_tasks::function]
    async fn content(
        self,
        context: ChunkingContextVc,
        origin_chunk: EcmascriptChunkVc,
    ) -> Result<EcmascriptChunkContentEvaluateVc> {
        let &EcmascriptChunkEvaluate {
            evaluate_entries,
            chunk_group,
        } = &*self.await?;
        let chunk_group =
            chunk_group.unwrap_or_else(|| ChunkGroupVc::from_chunk(origin_chunk.into()));
        let evaluate_chunks = chunk_group.chunks().await?;
        let mut chunks_server_paths = Vec::new();
        let output_root = context.output_root().await?;
        for chunk in evaluate_chunks.iter() {
            if let Some(ecma_chunk) = EcmascriptChunkVc::resolve_from(chunk).await? {
                if ecma_chunk != origin_chunk {
                    let chunk_path = &*chunk.path().await?;
                    if let Some(chunk_server_path) = output_root.get_path_to(chunk_path) {
                        chunks_server_paths.push(chunk_server_path.to_string());
                    }
                }
            }
        }
        let entry_modules_ids = evaluate_entries
            .await?
            .iter()
            .map(|entry| entry.as_chunk_item(context).id())
            .collect();
        Ok(EcmascriptChunkContentEvaluate {
            chunks_server_paths: StringsVc::cell(chunks_server_paths),
            entry_modules_ids: ModuleIdsVc::cell(entry_modules_ids),
        }
        .cell())
    }
}

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
fn ecmascript_chunk_content(
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
pub struct EcmascriptChunkContent {
    module_factories: EcmascriptChunkContentEntriesSnapshotReadRef,
    chunk_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
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
        main_entries: EcmascriptChunkPlaceablesVc,
        omit_entries: Option<EcmascriptChunkPlaceablesVc>,
        chunk_path: FileSystemPathVc,
        evaluate: Option<EcmascriptChunkContentEvaluateVc>,
    ) -> Result<Self> {
        // TODO(alexkirsz) All of this should be done in a transition, otherwise we run
        // the risks of values not being strongly consistent with each other.
        let chunk_content = ecmascript_chunk_content(context, main_entries, omit_entries);
        let chunk_content = chunk_content.await?;
        let module_factories = chunk_content.chunk_items.to_entry_snapshot().await?;
        let output_root = context.output_root();
        Ok(EcmascriptChunkContent {
            module_factories,
            chunk_path,
            output_root,
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

    fn source_code(&self) -> &Rope {
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
        let hash = hash_xxh3_hash64(code.source_code());
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
        "x: __turbopack_external_require__",
        "i: __turbopack_import__",
        "s: __turbopack_esm__",
        "v: __turbopack_export_value__",
        "c: __turbopack_cache__",
        "l: __turbopack_load__",
        "p: process",
        "g: global",
        // HACK
        "__dirname",
    ];
    if content.options.module {
        args.push("m: module");
    }
    if content.options.exports {
        args.push("e: exports");
    }
    let mut code = CodeBuilder::default();
    let args = FormatIter(|| args.iter().copied().intersperse(", "));
    if content.options.this {
        write!(code, "(function({{ {} }}) {{ !function() {{\n\n", args,)?;
    } else {
        write!(code, "(({{ {} }}) => (() => {{\n\n", args,)?;
    }

    let source_map = content.source_map.map(|sm| sm.as_generate_source_map());
    code.push_source(&content.inner_code, source_map);
    if content.options.this {
        code += "\n}.call(this) })";
    } else {
        code += "\n})())";
    }
    Ok(code.build().cell())
}

#[derive(Serialize)]
#[serde(tag = "type")]
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
        let chunk_path = &*this.chunk_path.await?;
        let chunk_server_path = if let Some(path) = this.output_root.await?.get_path_to(chunk_path)
        {
            path
        } else {
            bail!(
                "chunk path {} is not in output root {}",
                this.chunk_path.to_string().await?,
                this.output_root.to_string().await?
            );
        };
        let mut code = CodeBuilder::default();
        code += "(self.TURBOPACK = self.TURBOPACK || []).push([";

        writeln!(code, "{}, {{", stringify_str(chunk_server_path))?;
        for entry in &this.module_factories {
            write!(code, "\n{}: ", &stringify_module_id(entry.id()))?;
            code.push_code(entry.code());
            code += ",";
        }
        code += "\n}";

        if let Some(evaluate) = &this.evaluate {
            let evaluate = evaluate.await?;
            let condition = evaluate
                .chunks_server_paths
                .await?
                .iter()
                .map(|path| format!(" && loadedChunks.has({})", stringify_str(path)))
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
                ", ({{ loadedChunks, instantiateRuntimeModule }}) => {{
    if(!(true{condition})) return true;
    {entries_instantiations}
}}"
            )?;
        }
        code += "]);\n";
        if this.evaluate.is_some() {
            let runtime_code = embed_file!("js/src/runtime.js").await?;
            match &*runtime_code {
                FileContent::NotFound => return Err(anyhow!("runtime code is not found")),
                FileContent::Content(file) => code.push_source(file.content(), None),
            };
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
        let to_version = self_vc.version();
        let from_version =
            if let Some(from) = EcmascriptChunkVersionVc::resolve_from(from_version).await? {
                from
            } else {
                return Ok(Update::Total(TotalUpdate {
                    to: to_version.into(),
                })
                .cell());
            };

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
                instruction: JsonValueVc::cell(serde_json::to_value(&chunk_update)?),
            })
        };

        Ok(update.into())
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: EcmascriptChunkContentVc) -> SourceMapVc {
        self_vc.code().generate_source_map()
    }
}

#[derive(serde::Serialize)]
struct HmrUpdateEntry<'a> {
    code: &'a Rope,
    map: Option<String>,
}

impl<'a> HmrUpdateEntry<'a> {
    fn new(entry: &'a EcmascriptChunkContentEntry, chunk_path: &str) -> Self {
        HmrUpdateEntry {
            code: entry.source_code(),
            map: entry
                .code
                .has_source_map()
                .then(|| format!("{}.{}.map", chunk_path, entry.id.to_truncated_hash())),
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
            hasher.write_value(hash);
        }
        let hash = hasher.finish();
        let hex_hash = encode_hex(hash);
        Ok(StringVc::cell(hex_hash))
    }
}

#[turbo_tasks::value_impl]
impl Chunk for EcmascriptChunk {}

#[turbo_tasks::value_impl]
impl OptimizableChunk for EcmascriptChunk {
    #[turbo_tasks::function]
    fn get_optimizer(&self) -> ChunkOptimizerVc {
        EcmascriptChunkOptimizerVc::new(self.context).into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        let suffix = match self.evaluate {
            None => "".to_string(),
            Some(evaluate) => {
                let EcmascriptChunkEvaluate {
                    evaluate_entries, ..
                } = &*evaluate.await?;
                let evaluate_entries_ids = evaluate_entries
                    .await?
                    .iter()
                    .map(|entry| entry.path().to_string())
                    .try_join()
                    .await?;
                format!(
                    " (evaluate {})",
                    FormatIter(|| evaluate_entries_ids
                        .iter()
                        .map(|s| s.as_str())
                        .intersperse(", "))
                )
            }
        };

        async fn entries_to_string(
            entries: Option<EcmascriptChunkPlaceablesVc>,
        ) -> Result<Vec<StringReadRef>> {
            Ok(if let Some(entries) = entries {
                entries
                    .await?
                    .iter()
                    .map(|entry| entry.path().to_string())
                    .try_join()
                    .await?
            } else {
                Vec::new()
            })
        }
        let entry_strings = entries_to_string(Some(self.main_entries)).await?;
        let entry_strs = || entry_strings.iter().map(|s| s.as_str()).intersperse(" + ");
        let omit_entry_strings = entries_to_string(self.omit_entries).await?;
        let omit_entry_strs = || omit_entry_strings.iter().flat_map(|s| [" - ", s.as_str()]);
        Ok(StringVc::cell(format!(
            "chunk {}{}{}",
            FormatIter(entry_strs),
            FormatIter(omit_entry_strs),
            suffix
        )))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkVc {
    #[turbo_tasks::function]
    async fn chunk_content_result(self) -> Result<EcmascriptChunkContentResultVc> {
        let this = self.await?;
        Ok(ecmascript_chunk_content(
            this.context,
            this.main_entries,
            this.omit_entries,
        ))
    }

    #[turbo_tasks::function]
    async fn chunk_items_count(self) -> Result<UsizeVc> {
        Ok(UsizeVc::cell(
            self.chunk_content_result()
                .await?
                .chunk_items
                .await?
                .iter()
                .try_join()
                .await?
                .into_iter()
                .map(|chunk| chunk.len())
                .sum(),
        ))
    }

    #[turbo_tasks::function]
    async fn chunk_content(self) -> Result<EcmascriptChunkContentVc> {
        let this = self.await?;
        let evaluate = this
            .evaluate
            .map(|evaluate| evaluate.content(this.context, self));
        let chunk_path = self.path();
        let content = EcmascriptChunkContentVc::new(
            this.context,
            this.main_entries,
            this.omit_entries,
            chunk_path,
            evaluate,
        );
        Ok(content)
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn path(self_vc: EcmascriptChunkVc) -> Result<FileSystemPathVc> {
        let this = self_vc.await?;

        // All information that makes the chunk unique need to be encoded in the path.
        // As we can't make the path that long, we split info into "hashed info" and
        // "named info". All hashed info is hashed and that hash is appended to
        // the named info. Together they will make up the path.
        let mut hasher = Xxh3Hash64Hasher::new();
        let mut need_hash = false;

        // evalute only contributes to the hashed info
        if let Some(evaluate) = this.evaluate {
            let evaluate = evaluate.content(this.context, self_vc).await?;
            for path in evaluate.chunks_server_paths.await?.iter() {
                hasher.write_ref(path);
                need_hash = true;
            }
            for id in evaluate.entry_modules_ids.await?.iter() {
                hasher.write_value(id.await?);
                need_hash = true;
            }
        }
        let main_entries = this.main_entries.await?;
        // If there is only a single entry we can used that for the named info.
        // If there are multiple entries we hash them and use the common parent as named
        // info.
        let mut path = if main_entries.len() == 1 {
            let main_entry = main_entries.iter().next().unwrap();
            main_entry.path()
        } else {
            for entry in &main_entries {
                let path = entry.path().to_string().await?;
                hasher.write_value(path);
                need_hash = true;
            }
            if let &Some(common_parent) = &*self_vc.common_parent().await? {
                common_parent
            } else {
                let main_entry = main_entries
                    .iter()
                    .next()
                    .ok_or_else(|| anyhow!("chunk must have at least one entry"))?;
                main_entry.path()
            }
        };

        if need_hash {
            let hash = hasher.finish();
            let hash = encode_hex(hash);
            let truncated_hash = &hash[..6];
            path = path.append_to_stem(&format!("_{}", truncated_hash))
        }

        Ok(this.context.chunk_path(path, ".js"))
    }

    #[turbo_tasks::function]
    fn content(self_vc: EcmascriptChunkVc) -> AssetContentVc {
        self_vc.chunk_content().content()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: EcmascriptChunkVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let content =
            ecmascript_chunk_content(this.context, this.main_entries, this.omit_entries).await?;
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

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("ecmascript chunk".to_string())
}

#[turbo_tasks::function]
fn entry_module_key() -> StringVc {
    StringVc::cell("entry module".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for EcmascriptChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self_vc: EcmascriptChunkVc) -> StringVc {
        self_vc.path().to_string()
    }

    #[turbo_tasks::function]
    async fn details(self_vc: EcmascriptChunkVc) -> Result<StringVc> {
        let content = content_to_details(self_vc.content());
        let mut details = String::new();
        let this = self_vc.await?;
        let chunk_content =
            ecmascript_chunk_content(this.context, this.main_entries, this.omit_entries).await?;
        let chunk_items = chunk_content.chunk_items.await?;
        details += "Chunk items:\n\n";
        for chunk in chunk_items.iter() {
            for item in chunk.await?.iter() {
                writeln!(details, "- {}", item.to_string().await?)?;
            }
        }
        details += "\nContent:\n\n";
        write!(details, "{}", content.await?)?;
        Ok(StringVc::cell(details))
    }

    #[turbo_tasks::function]
    async fn children(self_vc: EcmascriptChunkVc) -> Result<IntrospectableChildrenVc> {
        let mut children = children_from_asset_references(self_vc.references())
            .await?
            .clone_value();
        for &entry in &*self_vc.await?.main_entries.await? {
            children.insert((entry_module_key(), IntrospectableAssetVc::new(entry.into())));
        }
        Ok(IntrospectableChildrenVc::cell(children))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: EcmascriptChunkVc) -> SourceMapVc {
        self_vc.chunk_content().generate_source_map()
    }
}

#[turbo_tasks::value]
struct EcmascriptChunkContentEvaluate {
    chunks_server_paths: StringsVc,
    entry_modules_ids: ModuleIdsVc,
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
    pub fn empty() -> Self {
        Self::cell(Vec::new())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct EcmascriptChunkItemContent {
    pub inner_code: Rope,
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
pub struct EcmascriptChunkItemsChunk(Vec<EcmascriptChunkItemVc>);

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkItems(Vec<EcmascriptChunkItemsChunkVc>);

impl EcmascriptChunkItems {
    pub fn make_chunks(list: &[EcmascriptChunkItemVc]) -> Vec<EcmascriptChunkItemsChunkVc> {
        let size = list.len().div_ceil(100);
        let chunk_items = list
            .chunks(size)
            .map(|chunk| EcmascriptChunkItemsChunkVc::cell(chunk.to_vec()))
            .collect();
        chunk_items
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItemsChunkVc {
    #[turbo_tasks::function]
    async fn to_entry_snapshot(self) -> Result<EcmascriptChunkContentEntriesSnapshotVc> {
        let list = self.await?;
        Ok(EcmascriptChunkContentEntries(
            list.iter()
                .map(|chunk_item| EcmascriptChunkContentEntryVc::new(*chunk_item))
                .collect(),
        )
        .cell()
        .snapshot())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItemsVc {
    #[turbo_tasks::function]
    async fn to_entry_snapshot(self) -> Result<EcmascriptChunkContentEntriesSnapshotVc> {
        let list = self.await?;
        Ok(EcmascriptChunkContentEntriesSnapshot::Nested(
            list.iter()
                .map(|chunk| chunk.to_entry_snapshot())
                .try_join()
                .await?,
        )
        .cell())
    }

    #[turbo_tasks::function]
    async fn to_set(self) -> Result<EcmascriptChunkItemsSetVc> {
        let mut set = IndexSet::new();
        for chunk in self.await?.iter().copied().try_join().await? {
            set.extend(chunk.iter().copied())
        }
        Ok(EcmascriptChunkItemsSetVc::cell(set))
    }
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkItemsSet(IndexSet<EcmascriptChunkItemVc>);
