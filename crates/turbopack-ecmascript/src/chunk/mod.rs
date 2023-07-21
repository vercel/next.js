pub(crate) mod content;
pub(crate) mod context;
pub(crate) mod data;
pub(crate) mod esm_scope;
pub(crate) mod item;
pub(crate) mod placeable;

use std::fmt::Write;

use anyhow::{anyhow, bail, Result};
use indexmap::IndexSet;
use turbo_tasks::{ReadRef, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPathOption;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkingContext, Chunks, ModuleIds,
    },
    ident::AssetIdent,
    introspect::{
        module::IntrospectableModule,
        utils::{children_from_output_assets, content_to_details},
        Introspectable, IntrospectableChildren,
    },
    module::Module,
    output::OutputAssets,
    reference::ModuleReference,
};

use self::content::ecmascript_chunk_content;
pub use self::{
    content::EcmascriptChunkContent,
    context::EcmascriptChunkingContext,
    data::EcmascriptChunkData,
    item::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemExt,
        EcmascriptChunkItemOptions,
    },
    placeable::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceables, EcmascriptExports},
};
use crate::utils::FormatIter;

#[turbo_tasks::value]
pub struct EcmascriptChunk {
    pub context: Vc<Box<dyn EcmascriptChunkingContext>>,
    pub main_entries: Vc<EcmascriptChunkPlaceables>,
    pub omit_entries: Option<Vc<EcmascriptChunkPlaceables>>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunks(Vec<Vc<EcmascriptChunk>>);

#[turbo_tasks::value_impl]
impl EcmascriptChunk {
    #[turbo_tasks::function]
    pub fn new_normalized(
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
        main_entries: Vc<EcmascriptChunkPlaceables>,
        omit_entries: Option<Vc<EcmascriptChunkPlaceables>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Self> {
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
        context: Vc<Box<dyn ChunkingContext>>,
        main_entry: Vc<Box<dyn EcmascriptChunkPlaceable>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<Self>> {
        let Some(context) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkingContext>>(context).await?
        else {
            bail!("Ecmascript chunking context not found");
        };

        Ok(Self::new_normalized(
            context,
            Vc::cell(vec![main_entry]),
            None,
            availability_info,
        ))
    }

    #[turbo_tasks::function]
    pub async fn new_root(
        context: Vc<Box<dyn ChunkingContext>>,
        main_entry: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Result<Vc<Self>> {
        let Some(context) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkingContext>>(context).await?
        else {
            bail!("Ecmascript chunking context not found");
        };

        Ok(Self::new_normalized(
            context,
            Vc::cell(vec![main_entry]),
            None,
            Value::new(AvailabilityInfo::Root {
                current_availability_root: Vc::upcast(main_entry),
            }),
        ))
    }

    #[turbo_tasks::function]
    pub async fn new_root_with_entries(
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
        main_entry: Vc<Box<dyn EcmascriptChunkPlaceable>>,
        other_entries: Vc<EcmascriptChunkPlaceables>,
    ) -> Result<Vc<Self>> {
        let mut main_entries = other_entries.await?.clone_value();
        main_entries.push(main_entry);

        Ok(Self::new_normalized(
            context,
            Vc::cell(main_entries),
            None,
            Value::new(AvailabilityInfo::Root {
                current_availability_root: Vc::upcast(main_entry),
            }),
        ))
    }

    /// Return the most specific directory which contains all elements of the
    /// chunk.
    #[turbo_tasks::function]
    pub async fn common_parent(self: Vc<Self>) -> Result<Vc<FileSystemPathOption>> {
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
                    return Ok(Vc::cell(None));
                }
                current = parent;
            }
        }
        Ok(Vc::cell(Some(current)))
    }

    #[turbo_tasks::function]
    pub async fn entry_ids(self: Vc<Self>) -> Result<Vc<ModuleIds>> {
        let this = self.await?;
        let entries = this
            .main_entries
            .await?
            .iter()
            .map(|&entry| entry.as_chunk_item(this.context).id())
            .collect();
        Ok(Vc::cell(entries))
    }

    #[turbo_tasks::function]
    pub async fn compare(
        left: Vc<EcmascriptChunk>,
        right: Vc<EcmascriptChunk>,
    ) -> Result<Vc<EcmascriptChunkComparison>> {
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
    async fn ident(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        let this = self.await?;

        // All information that makes the chunk unique need to be encoded in the params.

        // All main entries are included
        let main_entries = this.main_entries.await?;
        let main_entry_key = Vc::cell(String::new());
        let mut assets = main_entries
            .iter()
            .map(|entry| (main_entry_key, entry.ident()))
            .collect::<Vec<_>>();

        // The primary name of the chunk is the only entry or the common parent of all
        // entries.
        let path = if let [(_, ident)] = &assets[..] {
            ident.path()
        } else if let &Some(common_parent) = &*self.common_parent().await? {
            common_parent
        } else {
            let (_, ident) = assets[0];
            ident.path()
        };

        // All omit entries are included
        if let Some(omit_entries) = this.omit_entries {
            let omit_entries = omit_entries.await?;
            let omit_entry_key = Vc::cell("omit".to_string());
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
                let availability_root_key = Vc::cell("current_availability_root".to_string());
                assets.push((availability_root_key, ident));
            }
        }

        let mut modifiers = vec![];

        // Available assets are included
        if let Some(available_modules) = this.availability_info.available_modules() {
            modifiers.push(Vc::cell(available_modules.hash().await?.to_string()));
        }

        // Simplify when it's only a single main entry without extra info
        let ident = if assets.len() == 1 && modifiers.is_empty() {
            assets[0].1
        } else {
            AssetIdent::new(Value::new(AssetIdent {
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
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.context)
    }

    #[turbo_tasks::function]
    async fn parallel_chunks(&self) -> Result<Vc<Chunks>> {
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
        Ok(Vc::cell(chunks))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let content = ecmascript_chunk_content(
            this.context,
            this.main_entries,
            this.omit_entries,
            Value::new(this.availability_info),
        )
        .await?;
        let mut references = Vec::new();
        let assets = content
            .external_module_references
            .iter()
            .map(|r| r.resolve_reference().primary_output_assets())
            .try_join()
            .await?;
        for &output_asset in assets.iter().flatten() {
            references.push(output_asset);
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        async fn entries_to_string(
            entries: Option<Vc<EcmascriptChunkPlaceables>>,
        ) -> Result<Vec<ReadRef<String>>> {
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

        Ok(Vc::cell(format!(
            "chunk {}{}",
            FormatIter(entry_strs),
            FormatIter(omit_entry_strs),
        )))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunk {
    #[turbo_tasks::function]
    pub async fn chunk_content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkContent>> {
        let this = self.await?;
        Ok(ecmascript_chunk_content(
            this.context,
            this.main_entries,
            this.omit_entries,
            Value::new(this.availability_info),
        ))
    }

    #[turbo_tasks::function]
    pub async fn main_entries(self: Vc<Self>) -> Result<Vc<EcmascriptChunkPlaceables>> {
        let this = self.await?;
        Ok(this.main_entries)
    }

    #[turbo_tasks::function]
    pub async fn chunk_items_count(self: Vc<Self>) -> Result<Vc<usize>> {
        Ok(Vc::cell(self.chunk_content().await?.chunk_items.len()))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunk {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        bail!("EcmascriptChunk::content() is not implemented")
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<String> {
    Vc::cell("ecmascript chunk".to_string())
}

#[turbo_tasks::function]
fn entry_module_key() -> Vc<String> {
    Vc::cell("entry module".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for EcmascriptChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<String> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<String> {
        self.path().to_string()
    }

    #[turbo_tasks::function]
    async fn details(self: Vc<Self>) -> Result<Vc<String>> {
        let content = content_to_details(self.content());
        let mut details = String::new();
        let this = self.await?;
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
        Ok(Vc::cell(details))
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let mut children = children_from_output_assets(self.references())
            .await?
            .clone_value();
        for &entry in &*self.await?.main_entries.await? {
            children.insert((
                entry_module_key(),
                IntrospectableModule::new(Vc::upcast(entry)),
            ));
        }
        Ok(Vc::cell(children))
    }
}
