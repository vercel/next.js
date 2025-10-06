use std::collections::HashSet;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToString, Vc,
    graph::{AdjacencyMap, GraphTraversal},
};

use crate::{
    chunk::{ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    module::{Module, Modules},
    output::{OutputAsset, OutputAssets},
    raw_module::RawModule,
    resolve::{ExportUsage, ModuleResolveResult, RequestKey},
};
pub mod source_map;

pub use source_map::SourceMapReference;

/// A reference to one or multiple [Module]s, [OutputAsset]s or other special
/// things. There are a bunch of optional traits that can influence how these
/// references are handled. e. g. [ChunkableModuleReference]
///
/// [Module]: crate::module::Module
/// [OutputAsset]: crate::output::OutputAsset
/// [ChunkableModuleReference]: crate::chunk::ChunkableModuleReference
#[turbo_tasks::value_trait]
pub trait ModuleReference: ValueToString {
    #[turbo_tasks::function]
    fn resolve_reference(self: Vc<Self>) -> Vc<ModuleResolveResult>;
    // TODO think about different types
    // fn kind(&self) -> Vc<AssetReferenceType>;
}

/// Multiple [ModuleReference]s
#[turbo_tasks::value(transparent)]
pub struct ModuleReferences(Vec<ResolvedVc<Box<dyn ModuleReference>>>);

#[turbo_tasks::value_impl]
impl ModuleReferences {
    /// An empty list of [ModuleReference]s
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

/// A reference that always resolves to a single module.
#[turbo_tasks::value]
pub struct SingleModuleReference {
    asset: ResolvedVc<Box<dyn Module>>,
    description: RcStr,
}

#[turbo_tasks::value_impl]
impl ModuleReference for SingleModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.asset)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for SingleModuleReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.description.clone())
    }
}

#[turbo_tasks::value_impl]
impl SingleModuleReference {
    /// Create a new [Vc<SingleModuleReference>] that resolves to the given
    /// asset.
    #[turbo_tasks::function]
    pub fn new(asset: ResolvedVc<Box<dyn Module>>, description: RcStr) -> Vc<Self> {
        Self::cell(SingleModuleReference { asset, description })
    }

    /// The [Vc<Box<dyn Asset>>] that this reference resolves to.
    #[turbo_tasks::function]
    pub fn asset(&self) -> Vc<Box<dyn Module>> {
        *self.asset
    }
}

#[turbo_tasks::value]
pub struct SingleChunkableModuleReference {
    asset: ResolvedVc<Box<dyn Module>>,
    description: RcStr,
    export: ResolvedVc<ExportUsage>,
}

#[turbo_tasks::value_impl]
impl SingleChunkableModuleReference {
    #[turbo_tasks::function]
    pub fn new(
        asset: ResolvedVc<Box<dyn Module>>,
        description: RcStr,
        export: ResolvedVc<ExportUsage>,
    ) -> Vc<Self> {
        Self::cell(SingleChunkableModuleReference {
            asset,
            description,
            export,
        })
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for SingleChunkableModuleReference {
    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Parallel {
            inherit_async: true,
            hoisted: false,
        }))
    }

    #[turbo_tasks::function]
    fn export_usage(&self) -> Vc<ExportUsage> {
        *self.export
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for SingleChunkableModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.asset)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for SingleChunkableModuleReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.description.clone())
    }
}

/// A reference that always resolves to a single module.
#[turbo_tasks::value]
pub struct SingleOutputAssetReference {
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    description: RcStr,
}

#[turbo_tasks::value_impl]
impl ModuleReference for SingleOutputAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::output_asset(RequestKey::default(), self.asset)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for SingleOutputAssetReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.description.clone())
    }
}

#[turbo_tasks::value_impl]
impl SingleOutputAssetReference {
    /// Create a new [Vc<SingleOutputAssetReference>] that resolves to the given
    /// asset.
    #[turbo_tasks::function]
    pub fn new(asset: ResolvedVc<Box<dyn OutputAsset>>, description: RcStr) -> Vc<Self> {
        Self::cell(SingleOutputAssetReference { asset, description })
    }

    /// The [Vc<Box<dyn Asset>>] that this reference resolves to.
    #[turbo_tasks::function]
    pub fn asset(&self) -> Vc<Box<dyn OutputAsset>> {
        *self.asset
    }
}

/// Aggregates all [Module]s referenced by an [Module]. [ModuleReference]
/// This does not include transitively references [Module]s, but it includes
/// primary and secondary [Module]s referenced.
///
/// [Module]: crate::module::Module
#[turbo_tasks::function]
pub async fn referenced_modules_and_affecting_sources(
    module: Vc<Box<dyn Module>>,
) -> Result<Vc<Modules>> {
    let references = module.references().await?;

    let resolved_references = references
        .iter()
        .map(|r| r.resolve_reference())
        .try_join()
        .await?;
    let mut modules = Vec::new();
    for resolve_result in resolved_references {
        modules.extend(resolve_result.primary_modules_raw_iter());
        modules.extend(
            resolve_result
                .affecting_sources_iter()
                .map(|source| async move {
                    Ok(ResolvedVc::upcast(
                        RawModule::new(*source).to_resolved().await?,
                    ))
                })
                .try_join()
                .await?,
        );
    }

    let resolved_modules: FxIndexSet<_> = modules.into_iter().collect();

    Ok(Vc::cell(resolved_modules.into_iter().collect()))
}

#[turbo_tasks::value]
pub struct TracedModuleReference {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl ModuleReference for TracedModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.module)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TracedModuleReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("traced {}", self.module.ident().to_string().await?).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for TracedModuleReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Traced))
    }
}

#[turbo_tasks::value_impl]
impl TracedModuleReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(TracedModuleReference { module })
    }
}

/// Aggregates all primary [Module]s referenced by an [Module]. [AssetReference]
/// This does not include transitively references [Module]s, only includes
/// primary [Module]s referenced.
///
/// [Module]: crate::module::Module
#[turbo_tasks::function]
pub async fn primary_referenced_modules(module: Vc<Box<dyn Module>>) -> Result<Vc<Modules>> {
    let mut set = HashSet::new();
    let modules = module
        .references()
        .await?
        .iter()
        .map(|reference| async {
            reference
                .resolve_reference()
                .resolve()
                .await?
                .primary_modules()
                .owned()
                .await
        })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .filter(|&module| set.insert(module))
        .collect();
    Ok(Vc::cell(modules))
}

#[turbo_tasks::value(transparent)]
pub struct ModulesWithRefData(Vec<(ChunkingType, ExportUsage, ReadRef<Modules>)>);

/// Aggregates all primary [Module]s referenced by an [Module] via [ChunkableModuleReference]s.
/// This does not include transitively referenced [Module]s, only includes
/// primary [Module]s referenced.
///
/// [Module]: crate::module::Module
#[turbo_tasks::function]
pub async fn primary_chunkable_referenced_modules(
    module: ResolvedVc<Box<dyn Module>>,
    include_traced: bool,
) -> Result<Vc<ModulesWithRefData>> {
    let modules = module
        .references()
        .await?
        .iter()
        .map(|reference| async {
            if let Some(reference) =
                ResolvedVc::try_downcast::<Box<dyn ChunkableModuleReference>>(*reference)
                && let Some(chunking_type) = &*reference.chunking_type().await?
            {
                if !include_traced && matches!(chunking_type, ChunkingType::Traced) {
                    return Ok(None);
                }

                let resolved = reference
                    .resolve_reference()
                    .resolve()
                    .await?
                    .primary_modules()
                    .await?;
                let export = reference.export_usage().owned().await?;

                return Ok(Some((chunking_type.clone(), export, resolved)));
            }
            Ok(None)
        })
        .try_flat_join()
        .await?;
    Ok(Vc::cell(modules))
}

/// Walks the asset graph from multiple assets and collect all referenced
/// assets.
#[turbo_tasks::function]
pub async fn all_assets_from_entries(entries: Vc<OutputAssets>) -> Result<Vc<OutputAssets>> {
    Ok(Vc::cell(
        AdjacencyMap::new()
            .skip_duplicates()
            .visit(entries.await?.iter().copied(), get_referenced_assets)
            .await
            .completed()?
            .into_inner()
            .into_postorder_topological()
            .collect(),
    ))
}

/// Computes the list of all chunk children of a given chunk.
pub async fn get_referenced_assets(
    asset: ResolvedVc<Box<dyn OutputAsset>>,
) -> Result<impl Iterator<Item = ResolvedVc<Box<dyn OutputAsset>>> + Send> {
    Ok(asset
        .references()
        .await?
        .iter()
        .copied()
        .collect::<Vec<_>>()
        .into_iter())
}
