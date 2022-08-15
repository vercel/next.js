pub mod loader;

use std::{
    collections::{HashMap, HashSet},
    fmt::Write,
};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{StringVc, StringsVc},
    trace::TraceRawVcs,
    util::try_join_all,
    ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
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

use self::loader::ChunkGroupLoaderChunkItemVc;
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

    async fn file_content(&self) -> Result<FileContentVc> {
        let mut code = format!(
            "(self.TURBOPACK = self.TURBOPACK || []).push([{}, {{\n",
            stringify_str(&self.chunk_id.await?)
        );
        for (id, factory) in &self.module_factories {
            code = code + "\n" + &stringify_module_id(id) + ": " + factory + ",";
        }
        code += "\n}";
        if let Some(evaluate) = &self.evaluate {
            let evaluate = evaluate.await?;
            let condition = evaluate
                .chunks_ids
                .await?
                .iter()
                .map(|id| format!(" && chunks.has({})", stringify_str(id)))
                .collect::<Vec<_>>()
                .join("");
            let id = &&*evaluate.entry_module_id.await?;
            let entry_id = stringify_module_id(id);
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
        if self.evaluate.is_some() {
            // Add the turbopack runtime to the chunk.
            code += r#"(() => {
    if(Array.isArray(self.TURBOPACK)) {
        var array = self.TURBOPACK;
        var chunks = new Set();
        var runnable = [];
        var modules = { __proto__: null };
        var cache = { __proto__: null };
        var loading = { __proto__: null };
        var hOP = Object.prototype.hasOwnProperty;
        let socket;
        // TODO: temporary solution
        var _process = typeof process !== "undefined" ? process : { env: { NODE_ENV: "development" } };
        function require(from, id) {
            return getModule(from, id).exports;
        }
        var toStringTag = typeof Symbol !== "undefined" && Symbol.toStringTag;
        function defineProp(obj, name, options) {
            if (!hOP.call(obj, name)) Object.defineProperty(obj, name, options);
        }
        function esm(exports, getters) {
            defineProp(exports, "__esModule", { value: true });
            if(toStringTag) defineProp(exports, toStringTag, { value: "Module" });
            for(var key in getters) {
                defineProp(exports, key, { get: getters[key], enumerable: true, });
            }
        }
        function exportValue(module, value) {
            module.exports = value;
        }
        function createGetter(obj, key) {
            return () => obj[key];
        }
        function interopEsm(raw, ns, allowExportDefault) {
            var getters = { __proto__: null };
            if (typeof raw === "object") {
                for (var key in raw) {
                    getters[key] = createGetter(raw, key);
                }
            }
            if (!(allowExportDefault && "default" in getters)) {
                getters["default"] = () => raw;
            }
            esm(ns, getters);
        }
        function importModule(from, id, allowExportDefault) {
            var module = getModule(from, id);
            var raw = module.exports;
            if(raw.__esModule) return raw;
            if(module.interopNamespace) return module.interopNamespace;
            var ns = module.interopNamespace = {};
            interopEsm(raw, ns, allowExportDefault);
            return ns;
        }
        function loadFile(id, path) {
            if (chunks.has(id)) return;
            if (loading[id]) return loading[id].promise;

            var load = loading[id] = {};
            load.promise = new Promise((resolve, reject) => {
                load.resolve = resolve;
                load.reject = reject;
            }).catch(ev => {
                delete loading[id];
                throw ev;
            });

            var script = document.createElement('script');
            script.src = path;
            script.onerror = load.reject;
            document.body.appendChild(script);
            return load.promise;
        }
        function getModule(from, id) {
            var cacheEntry = cache[id];
            if(cacheEntry) {
                return cacheEntry;
            }
            var module = { exports: {}, loaded: false, id, parents: new Set(), children: new Set(), interopNamespace: undefined };
            cache[id] = module;
            var moduleFactory = modules[id];
            if(typeof moduleFactory != "function") {
                throw new Error(`Module ${id} was imported from module ${from}, but the module factory is not available`);
            }
            moduleFactory.call(module.exports, {
                e: module.exports,
                r: require.bind(null, id),
                i: importModule.bind(null, id),
                s: esm.bind(null, module.exports),
                v: exportValue.bind(null, module),
                m: module,
                c: cache,
                l: loadFile,
                p: _process
            });
            module.loaded = true;
            if(module.interopNamespace) {
                // in case of a circular dependency: cjs1 -> esm2 -> cjs1
                interopEsm(module.exports, module.interopNamespace);
            }
            return module;
        }
        var runtime = { chunks, modules, cache, getModule };
        function op([id, chunkModules, ...run]) {
            chunks.add(id);
            if(loading[id]) {
                loading[id].resolve();
                delete loading[id];
            }
            if(socket) socket.send(JSON.stringify(id));
            for(var m in chunkModules) {
                if(!modules[m]) modules[m] = chunkModules[m];
            }
            runnable.push(...run);
            runnable = runnable.filter(r => r(runtime))
        }
        if (typeof WebSocket !== "undefined") {
            var connectingSocket = new WebSocket("ws" + location.origin.slice(4));
            connectingSocket.onopen = () => {
                socket = connectingSocket;
                for(var chunk of chunks) {
                    socket.send(JSON.stringify(chunk));
                }
                socket.onmessage = (event) => {
                    var data = JSON.parse(event.data);
                    if (data.type === "restart" || data.type === "partial") {
                        location.reload();
                    }
                }
            }
        }
        self.TURBOPACK = { push: op };
        array.forEach(op);
    }
})();"#;
        }

        Ok(FileContent::Content(File::from_source(code)).into())
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
    async fn version_original(self) -> Result<EcmascriptChunkVersionVc> {
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
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptChunkContent {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<FileContentVc> {
        self.file_content().await
    }

    #[turbo_tasks::function]
    async fn version(self_vc: EcmascriptChunkContentVc) -> Result<VersionVc> {
        Ok(self_vc.version_original().into())
    }

    #[turbo_tasks::function]
    async fn update(
        self_vc: EcmascriptChunkContentVc,
        from_version: VersionVc,
    ) -> Result<UpdateVc> {
        let from_version = EcmascriptChunkVersionVc::resolve_from(from_version)
            .await?
            .expect("version must be an `EcmascriptChunkVersionVc`");
        let to_version = self_vc.version_original();

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

impl EcmascriptChunkVc {
    async fn chunk_content(self) -> Result<EcmascriptChunkContent> {
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
            }))
        } else {
            None
        };
        let path = self.path();
        let chunk_id = path.to_string();
        let content =
            EcmascriptChunkContent::new(this.context, this.entry, chunk_id, evaluate).await?;
        Ok(content)
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunk {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.context.chunk_path(self.entry.path(), ".js")
    }

    #[turbo_tasks::function]
    async fn content(self_vc: EcmascriptChunkVc) -> Result<FileContentVc> {
        let content = self_vc.chunk_content().await?;
        content.file_content().await
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
    async fn versioned_content(self_vc: EcmascriptChunkVc) -> Result<VersionedContentVc> {
        let content = self_vc.chunk_content().await?;
        Ok(content.cell().into())
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

    #[turbo_tasks::function]
    pub async fn helper_id(self, name: &str, related_asset: Option<AssetVc>) -> Result<ModuleIdVc> {
        if let Some(related_asset) = related_asset {
            Ok(ModuleId::String(format!(
                "{}/__/{}",
                related_asset.path().to_string().await?,
                name
            ))
            .into())
        } else {
            Ok(ModuleId::String(name.to_string()).into())
        }
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
        _context: ChunkingContextVc,
        asset: ChunkableAssetVc,
    ) -> Result<Option<Self>> {
        Ok(Some(ChunkGroupLoaderChunkItemVc::new(asset).into()))
    }
}
