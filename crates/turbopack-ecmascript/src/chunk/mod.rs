pub mod loader;

use std::{
    collections::{HashMap, HashSet},
    fmt::Write,
};

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{StringVc, StringsVc},
    trace::TraceRawVcs,
    util::try_join_all,
    ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{embed_file, File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{
        chunk_content, chunk_content_split, Chunk, ChunkContentResult, ChunkGroupReferenceVc,
        ChunkGroupVc, ChunkItemVc, ChunkReferenceVc, ChunkVc, ChunkableAssetVc, ChunkingContextVc,
        FromChunkableAsset, ModuleId, ModuleIdVc,
    },
    reference::{AssetReferenceVc, AssetReferencesVc},
    version::{
        PartialUpdate, Update, UpdateVc, Version, VersionVc, VersionedContent, VersionedContentVc,
    },
};
use turbopack_hash::{encode_hex, hash_xxh3_hash64, Xxh3Hash64Hasher};

use self::loader::{ManifestChunkAssetVc, ManifestLoaderItemVc};
use crate::{
    references::esm::EsmExportsVc,
    utils::{stringify_module_id, stringify_str, FormatIter},
};

#[turbo_tasks::value]
pub struct EcmascriptChunk {
    context: ChunkingContextVc,
    /// must implement [EcmascriptChunkPlaceable] too
    entry: AssetVc,
    evaluate: bool,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkVc {
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, entry: AssetVc) -> Self {
        Self::cell(EcmascriptChunk {
            context,
            entry,
            evaluate: false,
        })
    }
    #[turbo_tasks::function]
    pub fn new_evaluate(context: ChunkingContextVc, entry: AssetVc) -> Self {
        Self::cell(EcmascriptChunk {
            context,
            entry,
            evaluate: true,
        })
    }
}

#[turbo_tasks::function]
fn chunk_context(_context: ChunkingContextVc) -> EcmascriptChunkContextVc {
    EcmascriptChunkContextVc::cell(EcmascriptChunkContext {})
}

#[turbo_tasks::value]
pub struct EcmascriptChunkContentResult {
    pub chunk_items: Vec<EcmascriptChunkItemVc>,
    pub chunks: Vec<ChunkVc>,
    pub async_chunk_groups: Vec<ChunkGroupVc>,
    pub external_asset_references: Vec<AssetReferenceVc>,
}

impl From<ChunkContentResult<EcmascriptChunkItemVc>> for EcmascriptChunkContentResult {
    fn from(from: ChunkContentResult<EcmascriptChunkItemVc>) -> Self {
        EcmascriptChunkContentResult {
            chunk_items: from.chunk_items,
            chunks: from.chunks,
            async_chunk_groups: from.async_chunk_groups,
            external_asset_references: from.external_asset_references,
        }
    }
}
#[turbo_tasks::function]
async fn ecmascript_chunk_content(
    context: ChunkingContextVc,
    entry: AssetVc,
) -> Result<EcmascriptChunkContentResultVc> {
    Ok(EcmascriptChunkContentResultVc::cell(
        if let Some(res) = chunk_content::<EcmascriptChunkItemVc>(context, entry).await? {
            res
        } else {
            chunk_content_split::<EcmascriptChunkItemVc>(context, entry).await?
        }
        .into(),
    ))
}

#[turbo_tasks::value]
pub struct EcmascriptChunkContent {
    module_factories: Vec<(ModuleId, String)>,
    chunk_id: StringVc,
    evaluate: Option<EcmascriptChunkEvaluateVc>,
}

impl EcmascriptChunkContent {
    async fn new(
        context: ChunkingContextVc,
        entry: AssetVc,
        chunk_id: StringVc,
        evaluate: Option<EcmascriptChunkEvaluateVc>,
    ) -> Result<Self> {
        // TODO(alexkirsz) All of this should be done in a transition, otherwise we run
        // the risks of values not being strongly consistent with each other.
        let chunk_content = ecmascript_chunk_content(context, entry).await?;
        let c_context = chunk_context(context);
        let module_factories: Vec<_> = try_join_all(chunk_content.chunk_items.iter().map(
            |chunk_item| async move {
                let content = chunk_item.content(c_context, context);
                let factory = module_factory(content);
                let content_id = content.await?.id.await?;
                Ok((content_id.clone(), factory.await?.clone())) as Result<_>
            },
        ))
        .await?;
        Ok(EcmascriptChunkContent {
            module_factories,
            chunk_id,
            evaluate,
        })
    }
}

#[turbo_tasks::function]
async fn module_factory(content: EcmascriptChunkItemContentVc) -> Result<StringVc> {
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
    Ok(StringVc::cell(format!(
        "(({{ {} }}) => (() => {{\n\n{}\n}})())",
        FormatIter(|| args.iter().copied().intersperse(", ")),
        content.inner_code
    )))
}

#[derive(Serialize)]
struct EcmascriptChunkUpdate {
    added: HashMap<ModuleId, String>,
    modified: HashMap<ModuleId, String>,
    deleted: HashSet<ModuleId>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentVc {
    #[turbo_tasks::function]
    async fn version(self) -> Result<EcmascriptChunkVersionVc> {
        let module_factories_hashes = self
            .await?
            .module_factories
            .iter()
            .map(|(id, factory)| (id.clone(), hash_xxh3_hash64(factory.as_bytes())))
            .collect();
        Ok(EcmascriptChunkVersion {
            module_factories_hashes,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn content(self) -> Result<FileContentVc> {
        let this = self.await?;
        let mut code = format!(
            "(self.TURBOPACK = self.TURBOPACK || []).push([{}, {{\n",
            stringify_str(&this.chunk_id.await?)
        );
        for (id, factory) in &this.module_factories {
            code = code + "\n" + &stringify_module_id(id) + ": " + factory + ",";
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
            let entry_id = &*evaluate.entry_module_id.await?;
            let entry_id = stringify_module_id(entry_id);
            // Add a runnable to the chunk that requests the entry module to ensure it gets
            // executed when the chunk is evaluated.
            // The condition stops the entry module from being executed while chunks it
            // depend on have not yet been registered.
            // The runnable will run every time a new chunk is `.push`ed to TURBOPACK, until
            // all dependent chunks have been evaluated.
            let _ = write!(
                code,
                ", ({{ chunks, getModule }}) => {{
    if(!(true{condition})) return true;
    getModule(0, {entry_id})
}}"
            );
        }
        code += "]);\n";
        if let Some(evaluate) = &this.evaluate {
            let runtime_code = evaluate.await?.runtime_code.await?;
            let runtime_code = match &*runtime_code {
                FileContent::NotFound => return Err(anyhow!("failed to read runtime code")),
                FileContent::Content(file) => String::from_utf8(file.content().to_vec())
                    .context("runtime code is invalid UTF-8")?,
            };
            // Add the turbopack runtime to the chunk.
            code += runtime_code.as_str();
        }

        Ok(FileContent::Content(File::from_source(code)).into())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptChunkContent {
    #[turbo_tasks::function]
    fn content(self_vc: EcmascriptChunkContentVc) -> FileContentVc {
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
        let this = self_vc.await?;

        // TODO(alexkirsz) This should probably be stored as a HashMap already.
        let module_factories: HashMap<_, _> = this.module_factories.iter().cloned().collect();
        let mut added = HashMap::new();
        let mut modified = HashMap::new();
        let mut deleted = HashSet::new();

        let consistency_error =
            || anyhow!("consistency error: missing module in `EcmascriptChunkContent`");

        for (id, hash) in &to.module_factories_hashes {
            if let Some(old_hash) = from.module_factories_hashes.get(id) {
                if old_hash != hash {
                    modified.insert(
                        id.clone(),
                        module_factories
                            .get(id)
                            .ok_or_else(consistency_error)?
                            .clone(),
                    );
                }
            } else {
                added.insert(
                    id.clone(),
                    module_factories
                        .get(id)
                        .ok_or_else(consistency_error)?
                        .clone(),
                );
            }
        }

        for id in from.module_factories_hashes.keys() {
            if !to.module_factories_hashes.contains_key(id) {
                deleted.insert(id.clone());
            }
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

#[turbo_tasks::value]
struct EcmascriptChunkVersion {
    module_factories_hashes: HashMap<ModuleId, u64>,
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

#[turbo_tasks::value]
struct EcmascriptChunkEvaluate {
    chunks_ids: StringsVc,
    entry_module_id: ModuleIdVc,
    runtime_code: FileContentVc,
}

#[turbo_tasks::value_impl]
impl Chunk for EcmascriptChunk {}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "chunk {}",
            self.entry.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkVc {
    #[turbo_tasks::function]
    async fn chunk_content(self) -> Result<EcmascriptChunkContentVc> {
        let this = self.await?;
        let evaluate = if this.evaluate {
            let evaluate_chunks = ChunkGroupVc::from_chunk(self.into()).chunks().await?;
            let mut chunks_ids = Vec::new();
            for c in evaluate_chunks.iter() {
                if let Some(ecma_chunk) = EcmascriptChunkVc::resolve_from(c).await? {
                    if ecma_chunk != self {
                        chunks_ids.push(c.path().to_string().await?.clone());
                    }
                }
            }
            let c_context = chunk_context(this.context);
            let entry_module_id = EcmascriptChunkPlaceableVc::cast_from(this.entry)
                .as_chunk_item(this.context)
                .content(c_context, this.context)
                .await?
                .id;
            Some(EcmascriptChunkEvaluateVc::cell(EcmascriptChunkEvaluate {
                chunks_ids: StringsVc::cell(chunks_ids),
                entry_module_id,
                runtime_code: embed_file!("runtime.js"),
            }))
        } else {
            None
        };
        let path = self.path();
        let chunk_id = path.to_string();
        let content =
            EcmascriptChunkContent::new(this.context, this.entry, chunk_id, evaluate).await?;
        Ok(content.cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunk {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.context.chunk_path(self.entry.path(), ".js")
    }

    #[turbo_tasks::function]
    fn content(self_vc: EcmascriptChunkVc) -> FileContentVc {
        self_vc.chunk_content().content()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let content = ecmascript_chunk_content(self.context, self.entry).await?;
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
        Ok(AssetReferencesVc::cell(references))
    }

    #[turbo_tasks::function]
    fn versioned_content(self_vc: EcmascriptChunkVc) -> VersionedContentVc {
        self_vc.chunk_content().into()
    }
}

#[turbo_tasks::value]
pub struct EcmascriptChunkContext {}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContextVc {
    #[turbo_tasks::function]
    pub async fn id(self, placeable: EcmascriptChunkPlaceableVc) -> Result<ModuleIdVc> {
        Ok(ModuleId::String(placeable.to_string().await?.clone()).into())
    }

    /// Certain assets are split into a "loader" item that can be quickly
    /// embeded, and a "manifest" chunk which is more expensive to compute.
    #[turbo_tasks::function]
    pub fn manifest_loader_id(self, asset: AssetVc) -> ModuleIdVc {
        self.helper_id("manifest loader", asset)
    }

    /// Certain assets are split into a "loader" item that can be quickly
    /// embeded, and a "manifest" chunk which is more expensive to compute.
    #[turbo_tasks::function]
    pub fn manifest_chunk_id(self, asset: AssetVc) -> ModuleIdVc {
        self.helper_id("manifest chunk", asset)
    }

    #[turbo_tasks::function]
    async fn helper_id(self, name: &str, asset: AssetVc) -> Result<ModuleIdVc> {
        Ok(ModuleId::String(format!("{}/__/{}", asset.path().to_string().await?, name)).into())
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
pub trait EcmascriptChunkPlaceable: Asset + ValueToString {
    fn as_chunk_item(&self, context: ChunkingContextVc) -> EcmascriptChunkItemVc;
    fn get_exports(&self) -> EcmascriptExportsVc;
}

#[turbo_tasks::value(shared)]
pub struct EcmascriptChunkItemContent {
    pub inner_code: String,
    pub id: ModuleIdVc,
    pub options: EcmascriptChunkItemOptions,
}

#[derive(PartialEq, Eq, Default, Debug, Clone, Serialize, Deserialize, TraceRawVcs)]
pub struct EcmascriptChunkItemOptions {
    pub module: bool,
    pub exports: bool,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkItem: ChunkItem {
    // TODO handle Source Maps, maybe via separate method "content_with_map"
    fn content(
        &self,
        chunk_context: EcmascriptChunkContextVc,
        context: ChunkingContextVc,
    ) -> EcmascriptChunkItemContentVc;
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
            ManifestLoaderItemVc::new(chunk).into(),
            chunk.into(),
        )))
    }
}
