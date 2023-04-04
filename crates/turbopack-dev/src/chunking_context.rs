use std::fmt::Write;

use anyhow::Result;
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    Value, ValueToString,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64, DeterministicHash, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::{Asset, AssetVc, AssetsVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkVc, ChunkableAssetVc, ChunkingContext,
        ChunkingContextVc, EvaluatableAssetsVc, EvaluateChunkingContext, EvaluateChunkingContextVc,
    },
    environment::EnvironmentVc,
    ident::{AssetIdent, AssetIdentVc},
    resolve::ModulePart,
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkItemVc, EcmascriptChunkVc, EcmascriptChunkingContext,
    EcmascriptChunkingContextVc,
};

use crate::ecmascript::{
    chunk::EcmascriptDevChunkVc,
    evaluate::chunk::EcmascriptDevEvaluateChunkVc,
    manifest::{chunk_asset::DevManifestChunkAssetVc, loader_item::DevManifestLoaderItemVc},
};

pub struct DevChunkingContextBuilder {
    context: DevChunkingContext,
}

impl DevChunkingContextBuilder {
    pub fn hot_module_replacement(mut self) -> Self {
        self.context.enable_hot_module_replacement = true;
        self
    }

    pub fn layer(mut self, layer: &str) -> Self {
        self.context.layer = (!layer.is_empty()).then(|| layer.to_string());
        self
    }

    pub fn css_chunk_root_path(mut self, path: FileSystemPathVc) -> Self {
        self.context.css_chunk_root_path = Some(path);
        self
    }

    pub fn reference_chunk_source_maps(mut self, source_maps: bool) -> Self {
        self.context.reference_chunk_source_maps = source_maps;
        self
    }

    pub fn reference_css_chunk_source_maps(mut self, source_maps: bool) -> Self {
        self.context.reference_css_chunk_source_maps = source_maps;
        self
    }

    pub fn build(self) -> ChunkingContextVc {
        DevChunkingContextVc::new(Value::new(self.context)).into()
    }
}

/// A chunking context for development mode.
/// It uses readable filenames and module ids to improve development.
/// It also uses a chunking heuristic that is incremental and cacheable.
/// It splits "node_modules" separately as these are less likely to change
/// during development
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash, PartialOrd, Ord)]
pub struct DevChunkingContext {
    /// This path get striped off of path before creating a name out of it
    context_path: FileSystemPathVc,
    /// This path is used to compute the url to request chunks or assets from
    output_root: FileSystemPathVc,
    /// Chunks are placed at this path
    chunk_root_path: FileSystemPathVc,
    /// Chunks reference source maps assets
    reference_chunk_source_maps: bool,
    /// Css Chunks are placed at this path
    css_chunk_root_path: Option<FileSystemPathVc>,
    /// Css chunks reference source maps assets
    reference_css_chunk_source_maps: bool,
    /// Static assets are placed at this path
    asset_root_path: FileSystemPathVc,
    /// Layer name within this context
    layer: Option<String>,
    /// Enable HMR for this chunking
    enable_hot_module_replacement: bool,
    /// The environment chunks will be evaluated in.
    environment: EnvironmentVc,
}

impl DevChunkingContextVc {
    pub fn builder(
        context_path: FileSystemPathVc,
        output_root: FileSystemPathVc,
        chunk_root_path: FileSystemPathVc,
        asset_root_path: FileSystemPathVc,
        environment: EnvironmentVc,
    ) -> DevChunkingContextBuilder {
        DevChunkingContextBuilder {
            context: DevChunkingContext {
                context_path,
                output_root,
                chunk_root_path,
                reference_chunk_source_maps: true,
                css_chunk_root_path: None,
                reference_css_chunk_source_maps: true,
                asset_root_path,
                layer: None,
                enable_hot_module_replacement: false,
                environment,
            },
        }
    }
}

#[turbo_tasks::function]
fn chunk_list_modifier() -> StringVc {
    StringVc::cell("chunk list".to_string())
}

#[turbo_tasks::value_impl]
impl DevChunkingContextVc {
    #[turbo_tasks::function]
    fn new(this: Value<DevChunkingContext>) -> Self {
        this.into_value().cell()
    }

    #[turbo_tasks::function]
    pub async fn chunk_list_path(
        self,
        entry_chunk_ident: AssetIdentVc,
    ) -> Result<FileSystemPathVc> {
        let ident = entry_chunk_ident.with_modifier(chunk_list_modifier());
        Ok(self.chunk_path(ident, ".json"))
    }
}

#[turbo_tasks::value_impl]
impl ChunkingContext for DevChunkingContext {
    #[turbo_tasks::function]
    fn context_path(&self) -> FileSystemPathVc {
        self.context_path
    }

    #[turbo_tasks::function]
    fn output_root(&self) -> FileSystemPathVc {
        self.output_root
    }

    #[turbo_tasks::function]
    fn environment(&self) -> EnvironmentVc {
        self.environment
    }

    #[turbo_tasks::function]
    async fn chunk_path(&self, ident: AssetIdentVc, extension: &str) -> Result<FileSystemPathVc> {
        fn clean(s: &str) -> String {
            s.replace('/', "_")
        }
        let ident = &*ident.await?;

        // For clippy -- This explicit deref is necessary
        let path = &*ident.path.await?;
        let mut name = if let Some(inner) = self.context_path.await?.get_path_to(path) {
            clean(inner)
        } else {
            clean(&ident.path.to_string().await?)
        };
        let removed_extension = name.ends_with(extension);
        if removed_extension {
            name.truncate(name.len() - extension.len());
        }

        let default_modifier = match extension {
            ".js" => Some("ecmascript"),
            ".css" => Some("css"),
            _ => None,
        };

        let mut hasher = Xxh3Hash64Hasher::new();
        let mut has_hash = false;
        let AssetIdent {
            path: _,
            query,
            fragment,
            assets,
            modifiers,
            part,
        } = ident;
        if let Some(query) = query {
            0_u8.deterministic_hash(&mut hasher);
            query.await?.deterministic_hash(&mut hasher);
            has_hash = true;
        }
        if let Some(fragment) = fragment {
            1_u8.deterministic_hash(&mut hasher);
            fragment.await?.deterministic_hash(&mut hasher);
            has_hash = true;
        }
        for (key, ident) in assets.iter() {
            2_u8.deterministic_hash(&mut hasher);
            key.await?.deterministic_hash(&mut hasher);
            ident.to_string().await?.deterministic_hash(&mut hasher);
            has_hash = true;
        }
        for modifier in modifiers.iter() {
            let modifier = modifier.await?;
            if let Some(default_modifier) = default_modifier {
                if *modifier == default_modifier {
                    continue;
                }
            }
            3_u8.deterministic_hash(&mut hasher);
            modifier.deterministic_hash(&mut hasher);
            has_hash = true;
        }
        if let Some(part) = part {
            4_u8.deterministic_hash(&mut hasher);
            match &*part.await? {
                ModulePart::ModuleEvaluation => {
                    1_u8.deterministic_hash(&mut hasher);
                }
                ModulePart::Export(export) => {
                    2_u8.deterministic_hash(&mut hasher);
                    export.await?.deterministic_hash(&mut hasher);
                }
                ModulePart::Internal(id) => {
                    3_u8.deterministic_hash(&mut hasher);
                    id.deterministic_hash(&mut hasher);
                }
            }

            has_hash = true;
        }

        if has_hash {
            let hash = encode_hex(hasher.finish());
            let truncated_hash = &hash[..6];
            write!(name, "_{}", truncated_hash)?;
        }

        // Location in "path" where hashed and named parts are split.
        // Everything before i is hashed and after i named.
        let mut i = 0;
        static NODE_MODULES: &str = "_node_modules_";
        if let Some(j) = name.rfind(NODE_MODULES) {
            i = j + NODE_MODULES.len();
        }
        const MAX_FILENAME: usize = 80;
        if name.len() - i > MAX_FILENAME {
            i = name.len() - MAX_FILENAME;
            if let Some(j) = name[i..].find('_') {
                if j < 20 {
                    i += j + 1;
                }
            }
        }
        if i > 0 {
            let hash = encode_hex(hash_xxh3_hash64(name[..i].as_bytes()));
            let truncated_hash = &hash[..5];
            name = format!("{}_{}", truncated_hash, &name[i..]);
        }
        // We need to make sure that `.json` and `.json.js` doesn't end up with the same
        // name. So when we add an extra extension when want to mark that with a "._"
        // suffix.
        if !removed_extension {
            name += "._";
        }
        name += extension;
        let mut root_path = self.chunk_root_path;
        #[allow(clippy::single_match, reason = "future extensions")]
        match extension {
            ".css" => {
                if let Some(path) = self.css_chunk_root_path {
                    root_path = path;
                }
            }
            _ => {}
        }
        let root_path = if let Some(layer) = self.layer.as_deref() {
            root_path.join(layer)
        } else {
            root_path
        };
        Ok(root_path.join(&name))
    }

    #[turbo_tasks::function]
    async fn reference_chunk_source_maps(&self, chunk: AssetVc) -> Result<BoolVc> {
        let mut source_maps = self.reference_chunk_source_maps;
        let path = chunk.ident().path().await?;
        let extension = path.extension().unwrap_or_default();
        #[allow(clippy::single_match, reason = "future extensions")]
        match extension {
            ".css" => {
                source_maps = self.reference_css_chunk_source_maps;
            }
            _ => {}
        }
        Ok(BoolVc::cell(source_maps))
    }

    #[turbo_tasks::function]
    async fn can_be_in_same_chunk(&self, asset_a: AssetVc, asset_b: AssetVc) -> Result<BoolVc> {
        let parent_dir = asset_a.ident().path().parent().await?;

        let path = asset_b.ident().path().await?;
        if let Some(rel_path) = parent_dir.get_path_to(&path) {
            if !rel_path.starts_with("node_modules/") && !rel_path.contains("/node_modules/") {
                return Ok(BoolVc::cell(true));
            }
        }

        Ok(BoolVc::cell(false))
    }

    #[turbo_tasks::function]
    fn asset_path(&self, content_hash: &str, extension: &str) -> FileSystemPathVc {
        self.asset_root_path
            .join(&format!("{content_hash}.{extension}"))
    }

    #[turbo_tasks::function]
    fn is_hot_module_replacement_enabled(&self) -> BoolVc {
        BoolVc::cell(self.enable_hot_module_replacement)
    }

    #[turbo_tasks::function]
    fn layer(&self) -> StringVc {
        StringVc::cell(self.layer.clone().unwrap_or_default())
    }

    #[turbo_tasks::function]
    async fn with_layer(self_vc: DevChunkingContextVc, layer: &str) -> Result<ChunkingContextVc> {
        let mut context = self_vc.await?.clone_value();
        context.layer = (!layer.is_empty()).then(|| layer.to_string());
        Ok(DevChunkingContextVc::new(Value::new(context)).into())
    }

    #[turbo_tasks::function]
    async fn generate_chunk(self_vc: DevChunkingContextVc, chunk: ChunkVc) -> Result<AssetVc> {
        Ok(
            if let Some(ecmascript_chunk) = EcmascriptChunkVc::resolve_from(chunk).await? {
                EcmascriptDevChunkVc::new(self_vc, ecmascript_chunk).into()
            } else {
                chunk.into()
            },
        )
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkingContext for DevChunkingContext {
    #[turbo_tasks::function]
    fn manifest_loader_item(
        self_vc: DevChunkingContextVc,
        asset: ChunkableAssetVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> EcmascriptChunkItemVc {
        let manifest_asset = DevManifestChunkAssetVc::new(asset, self_vc, availability_info);
        DevManifestLoaderItemVc::new(manifest_asset).into()
    }
}

#[turbo_tasks::value_impl]
impl EvaluateChunkingContext for DevChunkingContext {
    #[turbo_tasks::function]
    fn evaluate_chunk(
        self_vc: DevChunkingContextVc,
        entry_chunk: ChunkVc,
        other_chunks: AssetsVc,
        evaluatable_assets: EvaluatableAssetsVc,
    ) -> AssetVc {
        EcmascriptDevEvaluateChunkVc::new(self_vc, entry_chunk, other_chunks, evaluatable_assets)
            .into()
    }
}
