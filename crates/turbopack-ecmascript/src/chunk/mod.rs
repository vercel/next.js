pub(crate) mod content;
pub(crate) mod context;
pub(crate) mod item;
pub(crate) mod placeable;

use std::fmt::Write;

use anyhow::{anyhow, bail, Result};
use indexmap::IndexSet;
use turbo_tasks::{
    primitives::{StringReadRef, StringVc, UsizeVc},
    TryJoinIterExt, Value, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::FileSystemPathOptionVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkGroupReferenceVc, ChunkItem, ChunkVc,
        ChunkingContextVc, ChunksVc, ModuleIdsVc,
    },
    ident::{AssetIdent, AssetIdentVc},
    introspect::{
        asset::{children_from_asset_references, content_to_details, IntrospectableAssetVc},
        Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    reference::AssetReferencesVc,
};

use self::content::ecmascript_chunk_content;
pub use self::{
    content::{EcmascriptChunkContent, EcmascriptChunkContentVc},
    context::{EcmascriptChunkingContext, EcmascriptChunkingContextVc},
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
    pub context: EcmascriptChunkingContextVc,
    pub main_entries: EcmascriptChunkPlaceablesVc,
    pub omit_entries: Option<EcmascriptChunkPlaceablesVc>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunks(Vec<EcmascriptChunkVc>);

#[turbo_tasks::value_impl]
impl EcmascriptChunkVc {
    #[turbo_tasks::function]
    pub fn new_normalized(
        context: EcmascriptChunkingContextVc,
        main_entries: EcmascriptChunkPlaceablesVc,
        omit_entries: Option<EcmascriptChunkPlaceablesVc>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Self {
        EcmascriptChunk {
            context,
            main_entries,
            omit_entries,
            availability_info: availability_info.into_value(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn new(
        context: ChunkingContextVc,
        main_entry: EcmascriptChunkPlaceableVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Self> {
        let Some(context) = EcmascriptChunkingContextVc::resolve_from(&context).await? else {
            bail!("Ecmascript chunking context not found");
        };

        Ok(Self::new_normalized(
            context,
            EcmascriptChunkPlaceablesVc::cell(vec![main_entry]),
            None,
            availability_info,
        ))
    }

    #[turbo_tasks::function]
    pub async fn new_root(
        context: ChunkingContextVc,
        main_entry: EcmascriptChunkPlaceableVc,
    ) -> Result<Self> {
        let Some(context) = EcmascriptChunkingContextVc::resolve_from(&context).await? else {
            bail!("Ecmascript chunking context not found");
        };

        Ok(Self::new_normalized(
            context,
            EcmascriptChunkPlaceablesVc::cell(vec![main_entry]),
            None,
            Value::new(AvailabilityInfo::Root {
                current_availability_root: main_entry.as_asset(),
            }),
        ))
    }

    #[turbo_tasks::function]
    pub async fn new_root_with_entries(
        context: EcmascriptChunkingContextVc,
        main_entry: EcmascriptChunkPlaceableVc,
        other_entries: EcmascriptChunkPlaceablesVc,
    ) -> Result<Self> {
        let mut main_entries = other_entries.await?.clone_value();
        main_entries.push(main_entry);

        Ok(Self::new_normalized(
            context,
            EcmascriptChunkPlaceablesVc::cell(main_entries),
            None,
            Value::new(AvailabilityInfo::Root {
                current_availability_root: main_entry.as_asset(),
            }),
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
    pub async fn entry_ids(self) -> Result<ModuleIdsVc> {
        let this = self.await?;
        let entries = this
            .main_entries
            .await?
            .iter()
            .map(|&entry| entry.as_chunk_item(this.context).id())
            .collect();
        Ok(ModuleIdsVc::cell(entries))
    }

    #[turbo_tasks::function]
    pub async fn compare(
        left: EcmascriptChunkVc,
        right: EcmascriptChunkVc,
    ) -> Result<EcmascriptChunkComparisonVc> {
        let a = left.await?;
        let b = right.await?;

        let a = ecmascript_chunk_content(
            a.context,
            a.main_entries,
            a.omit_entries,
            Value::new(a.availability_info),
        );
        let b = ecmascript_chunk_content(
            b.context,
            b.main_entries,
            b.omit_entries,
            Value::new(b.availability_info),
        );

        let a: IndexSet<_> = a.await?.chunk_items.iter().copied().collect();
        let b: IndexSet<_> = b.await?.chunk_items.iter().copied().collect();

        let mut unshared_a = a.clone();
        let mut unshared_b = b.clone();
        let mut shared = IndexSet::new();
        for item in b {
            if unshared_a.remove(&item) {
                shared.insert(item);
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
    pub shared_chunk_items: usize,
    pub left_chunk_items: usize,
    pub right_chunk_items: usize,
}

#[turbo_tasks::value_impl]
impl Chunk for EcmascriptChunk {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context.into()
    }

    #[turbo_tasks::function]
    async fn parallel_chunks(&self) -> Result<ChunksVc> {
        let content = ecmascript_chunk_content(
            self.context,
            self.main_entries,
            self.omit_entries,
            Value::new(self.availability_info),
        )
        .await?;
        let mut chunks = Vec::new();
        for chunk in content.chunks.iter() {
            chunks.push(*chunk);
        }
        Ok(ChunksVc::cell(chunks))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
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
            "chunk {}{}",
            FormatIter(entry_strs),
            FormatIter(omit_entry_strs),
        )))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkVc {
    #[turbo_tasks::function]
    pub async fn chunk_content(self) -> Result<EcmascriptChunkContentVc> {
        let this = self.await?;
        Ok(ecmascript_chunk_content(
            this.context,
            this.main_entries,
            this.omit_entries,
            Value::new(this.availability_info),
        ))
    }

    #[turbo_tasks::function]
    pub async fn main_entries(self) -> Result<EcmascriptChunkPlaceablesVc> {
        let this = self.await?;
        Ok(this.main_entries)
    }

    #[turbo_tasks::function]
    pub async fn chunk_items_count(self) -> Result<UsizeVc> {
        Ok(UsizeVc::cell(self.chunk_content().await?.chunk_items.len()))
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

        // Current availability root is included
        if let Some(current_availability_root) = this.availability_info.current_availability_root()
        {
            let ident = current_availability_root.ident();
            let need_root = if let [(_, main_entry)] = &assets[..] {
                main_entry.resolve().await? != ident.resolve().await?
            } else {
                true
            };
            if need_root {
                let availability_root_key = StringVc::cell("current_availability_root".to_string());
                assets.push((availability_root_key, ident));
            }
        }

        let mut modifiers = vec![];

        // Available assets are included
        if let Some(available_assets) = this.availability_info.available_assets() {
            modifiers.push(available_assets.hash().to_string());
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
                part: None,
            }))
        };

        Ok(ident)
    }

    #[turbo_tasks::function]
    fn content(_self_vc: EcmascriptChunkVc) -> Result<AssetContentVc> {
        bail!("EcmascriptChunkVc::content() is not implemented")
    }

    #[turbo_tasks::function]
    async fn references(self_vc: EcmascriptChunkVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let content = ecmascript_chunk_content(
            this.context,
            this.main_entries,
            this.omit_entries,
            Value::new(this.availability_info),
        )
        .await?;
        let mut references = Vec::new();
        for r in content.external_asset_references.iter() {
            references.push(*r);
        }
        for entry in content.async_chunk_group_entries.iter() {
            references.push(ChunkGroupReferenceVc::new(this.context.into(), *entry).into());
        }

        Ok(AssetReferencesVc::cell(references))
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
        let chunk_content = ecmascript_chunk_content(
            this.context,
            this.main_entries,
            this.omit_entries,
            Value::new(this.availability_info),
        )
        .await?;
        details += "Chunk items:\n\n";
        for chunk_item in chunk_content.chunk_items.iter() {
            writeln!(details, "- {}", chunk_item.asset_ident().to_string().await?)?;
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
