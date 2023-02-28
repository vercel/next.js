pub(crate) mod content;
pub(crate) mod context;
pub(crate) mod evaluate;
pub(crate) mod item;
pub(crate) mod manifest;
pub(crate) mod module_factory;
pub(crate) mod optimize;
pub(crate) mod placeable;
pub(crate) mod snapshot;
pub(crate) mod source_map;
pub(crate) mod update;
pub(crate) mod version;

use std::fmt::Write;

use anyhow::{anyhow, Result};
use indexmap::IndexSet;
use turbo_tasks::{
    primitives::{StringReadRef, StringVc, UsizeVc},
    TryJoinIterExt, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{FileSystemPathOptionVc, FileSystemPathVc};
use turbo_tasks_hash::{encode_hex, DeterministicHasher, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        optimize::{ChunkOptimizerVc, OptimizableChunk, OptimizableChunkVc},
        Chunk, ChunkGroupReferenceVc, ChunkReferenceVc, ChunkVc, ChunkingContext,
        ChunkingContextVc,
    },
    introspect::{
        asset::{children_from_asset_references, content_to_details, IntrospectableAssetVc},
        Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    reference::AssetReferencesVc,
    source_map::{GenerateSourceMap, GenerateSourceMapVc, SourceMapVc},
    version::{VersionedContent, VersionedContentVc},
};

use self::{
    content::{ecmascript_chunk_content, EcmascriptChunkContentResultVc, EcmascriptChunkContentVc},
    optimize::EcmascriptChunkOptimizerVc,
    source_map::EcmascriptChunkSourceMapAssetReferenceVc,
};
pub use self::{
    evaluate::{EcmascriptChunkEvaluate, EcmascriptChunkEvaluateVc},
    item::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemOptions, EcmascriptChunkItemVc,
    },
    placeable::{
        EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkPlaceables,
        EcmascriptChunkPlaceablesVc, EcmascriptExports, EcmascriptExportsVc,
    },
};
use crate::utils::FormatIter;

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
            let path = path.resolve().await?;
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
            let ecma_chunks_server_paths = &evaluate.ecma_chunks_server_paths;
            hasher.write_usize(ecma_chunks_server_paths.len());
            for path in ecma_chunks_server_paths.iter() {
                hasher.write_ref(path);
                need_hash = true;
            }
            let other_chunks_server_paths = &evaluate.other_chunks_server_paths;
            hasher.write_usize(other_chunks_server_paths.len());
            for path in other_chunks_server_paths.iter() {
                hasher.write_ref(path);
                need_hash = true;
            }
            let entry_modules_ids = &evaluate.entry_modules_ids;
            hasher.write_usize(entry_modules_ids.len());
            for id in entry_modules_ids.iter() {
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
            hasher.write_usize(main_entries.len());
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
        if let Some(omit_entries) = this.omit_entries {
            let omit_entries = omit_entries.await?;
            hasher.write_usize(omit_entries.len());
            for omit_entry in &omit_entries {
                let path = omit_entry.path().to_string().await?;
                hasher.write_value(path);
            }
            need_hash = true;
        }

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
        references.push(EcmascriptChunkSourceMapAssetReferenceVc::new(self_vc).into());

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
