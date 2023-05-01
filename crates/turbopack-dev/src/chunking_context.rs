use std::fmt::Write;

use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{
    graph::{GraphTraversal, ReverseTopological},
    primitives::{BoolVc, StringVc},
    TryJoinIterExt, Value, ValueToString,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64, DeterministicHash, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::{Asset, AssetVc, AssetsVc},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkVc, ChunkableAsset, ChunkableAssetVc,
        ChunkingContext, ChunkingContextVc, ChunksVc, EvaluatableAssetsVc,
    },
    environment::EnvironmentVc,
    ident::{AssetIdent, AssetIdentVc},
    resolve::ModulePart,
};
use turbopack_css::chunk::{CssChunkVc, CssChunksVc};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkItemVc, EcmascriptChunkVc, EcmascriptChunkingContext,
    EcmascriptChunkingContextVc, EcmascriptChunksVc,
};

use crate::{
    css::optimize::optimize_css_chunks,
    ecmascript::{
        chunk::EcmascriptDevChunkVc,
        evaluate::chunk::EcmascriptDevEvaluateChunkVc,
        list::asset::{EcmascriptDevChunkListSource, EcmascriptDevChunkListVc},
        manifest::{chunk_asset::DevManifestChunkAssetVc, loader_item::DevManifestLoaderItemVc},
        optimize::optimize_ecmascript_chunks,
    },
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
                reference_css_chunk_source_maps: true,
                asset_root_path,
                layer: None,
                enable_hot_module_replacement: false,
                environment,
            },
        }
    }
}

#[turbo_tasks::value_impl]
impl DevChunkingContextVc {
    #[turbo_tasks::function]
    fn new(this: Value<DevChunkingContext>) -> Self {
        this.into_value().cell()
    }

    #[turbo_tasks::function]
    pub(crate) async fn generate_chunk(
        self_vc: DevChunkingContextVc,
        chunk: ChunkVc,
    ) -> Result<AssetVc> {
        Ok(
            if let Some(ecmascript_chunk) = EcmascriptChunkVc::resolve_from(chunk).await? {
                EcmascriptDevChunkVc::new(self_vc, ecmascript_chunk).into()
            } else {
                chunk.into()
            },
        )
    }

    #[turbo_tasks::function]
    fn generate_evaluate_chunk(
        self_vc: DevChunkingContextVc,
        entry_chunk: ChunkVc,
        other_chunks: AssetsVc,
        evaluatable_assets: EvaluatableAssetsVc,
    ) -> AssetVc {
        EcmascriptDevEvaluateChunkVc::new(self_vc, entry_chunk, other_chunks, evaluatable_assets)
            .into()
    }

    #[turbo_tasks::function]
    fn generate_chunk_list_register_chunk(
        self_vc: DevChunkingContextVc,
        entry_chunk: ChunkVc,
        other_chunks: AssetsVc,
        source: Value<EcmascriptDevChunkListSource>,
    ) -> AssetVc {
        EcmascriptDevChunkListVc::new(self_vc, entry_chunk, other_chunks, source).into()
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
        let root_path = self.chunk_root_path;
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
    async fn chunk_group(self_vc: DevChunkingContextVc, entry_chunk: ChunkVc) -> Result<AssetsVc> {
        let parallel_chunks = get_parallel_chunks([entry_chunk]).await?;

        let optimized_chunks = get_optimized_chunks(parallel_chunks).await?;

        let mut assets: Vec<AssetVc> = optimized_chunks
            .await?
            .iter()
            .map(|chunk| self_vc.generate_chunk(*chunk))
            .collect();

        assets.push(self_vc.generate_chunk_list_register_chunk(
            entry_chunk,
            AssetsVc::cell(assets.clone()),
            Value::new(EcmascriptDevChunkListSource::Dynamic),
        ));

        Ok(AssetsVc::cell(assets))
    }

    #[turbo_tasks::function]
    async fn evaluated_chunk_group(
        self_vc: DevChunkingContextVc,
        entry_chunk: ChunkVc,
        evaluatable_assets: EvaluatableAssetsVc,
    ) -> Result<AssetsVc> {
        let evaluatable_assets_ref = evaluatable_assets.await?;

        let mut entry_assets: IndexSet<_> = evaluatable_assets_ref
            .iter()
            .map({
                move |evaluatable_asset| async move {
                    Ok(evaluatable_asset
                        .as_root_chunk(self_vc.into())
                        .resolve()
                        .await?)
                }
            })
            .try_join()
            .await?
            .into_iter()
            .collect();

        entry_assets.insert(entry_chunk.resolve().await?);

        let parallel_chunks = get_parallel_chunks(entry_assets).await?;

        let optimized_chunks = get_optimized_chunks(parallel_chunks).await?;

        let mut assets: Vec<AssetVc> = optimized_chunks
            .await?
            .iter()
            .map(|chunk| self_vc.generate_chunk(*chunk))
            .collect();

        let other_assets = AssetsVc::cell(assets.clone());

        assets.push(self_vc.generate_chunk_list_register_chunk(
            entry_chunk,
            other_assets,
            Value::new(EcmascriptDevChunkListSource::Entry),
        ));

        assets.push(self_vc.generate_evaluate_chunk(entry_chunk, other_assets, evaluatable_assets));

        Ok(AssetsVc::cell(assets))
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

async fn get_parallel_chunks<I>(entries: I) -> Result<impl Iterator<Item = ChunkVc>>
where
    I: IntoIterator<Item = ChunkVc>,
{
    Ok(ReverseTopological::new()
        .skip_duplicates()
        .visit(entries, |chunk: ChunkVc| async move {
            Ok(chunk
                .parallel_chunks()
                .await?
                .iter()
                .copied()
                .collect::<Vec<_>>()
                .into_iter())
        })
        .await
        .completed()?
        .into_inner()
        .into_iter())
}

async fn get_optimized_chunks<I>(chunks: I) -> Result<ChunksVc>
where
    I: IntoIterator<Item = ChunkVc>,
{
    let mut ecmascript_chunks = vec![];
    let mut css_chunks = vec![];
    let mut other_chunks = vec![];

    for chunk in chunks.into_iter() {
        if let Some(ecmascript_chunk) = EcmascriptChunkVc::resolve_from(&chunk).await? {
            ecmascript_chunks.push(ecmascript_chunk);
        } else if let Some(css_chunk) = CssChunkVc::resolve_from(&chunk).await? {
            css_chunks.push(css_chunk);
        } else {
            other_chunks.push(chunk);
        }
    }

    let ecmascript_chunks =
        optimize_ecmascript_chunks(EcmascriptChunksVc::cell(ecmascript_chunks)).await?;
    let css_chunks = optimize_css_chunks(CssChunksVc::cell(css_chunks)).await?;

    let chunks = ecmascript_chunks
        .iter()
        .copied()
        .map(|chunk| chunk.as_chunk())
        .chain(css_chunks.iter().copied().map(|chunk| chunk.as_chunk()))
        .chain(other_chunks.into_iter())
        .collect();

    Ok(ChunksVc::cell(chunks))
}
