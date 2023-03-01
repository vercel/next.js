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
    TryJoinIterExt, Value, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::FileSystemPathOptionVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        optimize::{ChunkOptimizerVc, OptimizableChunk, OptimizableChunkVc},
        Chunk, ChunkGroupReferenceVc, ChunkItem, ChunkReferenceVc, ChunkVc, ChunkingContext,
        ChunkingContextVc,
    },
    ident::{AssetIdent, AssetIdentVc},
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
        let mut paths = main_entries
            .iter()
            .map(|entry| entry.ident().path().parent());
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
                    .map(|entry| entry.ident().to_string())
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
                    .map(|entry| entry.ident().to_string())
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
    async fn ident(self_vc: EcmascriptChunkVc) -> Result<AssetIdentVc> {
        let this = self_vc.await?;

        // All information that makes the chunk unique need to be encoded in the params.

        // All main entries are included
        let main_entries = this.main_entries.await?;
        let main_entry_key = StringVc::cell(String::new());
        let mut assets = main_entries
            .iter()
            .map(|entry| (main_entry_key, entry.ident()))
            .collect::<Vec<_>>();

        // The primary name of the chunk is the only entry or the common parent of all
        // entries.
        let path = if let [(_, ident)] = &assets[..] {
            ident.path()
        } else if let &Some(common_parent) = &*self_vc.common_parent().await? {
            common_parent
        } else {
            let (_, ident) = assets[0];
            ident.path()
        };

        // All omit entries are included
        if let Some(omit_entries) = this.omit_entries {
            let omit_entries = omit_entries.await?;
            let omit_entry_key = StringVc::cell("omit".to_string());
            for entry in omit_entries.iter() {
                assets.push((omit_entry_key, entry.ident()))
            }
        }

        // Evaluate info is included
        let mut modifiers = Vec::new();
        if let Some(evaluate) = this.evaluate {
            let evaluate = evaluate.content(this.context, self_vc).await?;
            modifiers.extend(
                evaluate
                    .ecma_chunks_server_paths
                    .iter()
                    .cloned()
                    .map(StringVc::cell),
            );
            modifiers.extend(
                evaluate
                    .other_chunks_server_paths
                    .iter()
                    .cloned()
                    .map(StringVc::cell),
            );
            modifiers.extend(evaluate.entry_modules_ids.iter().map(|id| id.to_string()));
        }

        // Simplify when it's only a single main entry without extra info
        let ident = if assets.len() == 1 && modifiers.is_empty() {
            assets[0].1
        } else {
            AssetIdentVc::new(Value::new(AssetIdent {
                path,
                query: None,
                fragment: None,
                assets,
                modifiers,
            }))
        };

        Ok(AssetIdentVc::from_path(
            this.context.chunk_path(ident, ".js"),
        ))
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
                writeln!(details, "- {}", item.asset_ident().to_string().await?)?;
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
