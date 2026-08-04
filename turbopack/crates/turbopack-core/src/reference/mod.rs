use std::collections::HashSet;

use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};

use crate::{
    chunk::{ChunkingType, TracedMode},
    issue::IssueSource,
    module::{Module, Modules},
    output::{
        ExpandOutputAssetsInput, ExpandedOutputAssets, OutputAsset, OutputAssets,
        expand_output_assets,
    },
    raw_module::RawModule,
    resolve::{BindingUsage, ExportUsage, ImportUsage, ModuleResolveResult},
};
pub mod source_map;

pub use source_map::SourceMapReference;

/// A reference to one or multiple [Module]s, [OutputAsset]s or other special
/// things.
///
/// [Module]: crate::module::Module
/// [OutputAsset]: crate::output::OutputAsset
#[turbo_tasks::value_trait]
pub trait ModuleReference: ValueToString {
    #[turbo_tasks::function]
    fn resolve_reference(self: Vc<Self>) -> Vc<ModuleResolveResult>;
    // TODO think about different types
    // fn kind(&self) -> Vc<AssetReferenceType>;

    fn chunking_type(&self) -> Option<ChunkingType>;

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage::default()
    }

    fn source(&self) -> Option<IssueSource> {
        None
    }
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

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string(self.description)]
pub struct SingleChunkableModuleReference {
    asset: ResolvedVc<Box<dyn Module>>,
    description: RcStr,
    export: ExportUsage,
}

#[turbo_tasks::value_impl]
impl SingleChunkableModuleReference {
    #[turbo_tasks::function]
    pub async fn new(
        asset: ResolvedVc<Box<dyn Module>>,
        description: RcStr,
        export: Vc<ExportUsage>,
    ) -> Result<Vc<Self>> {
        Ok(Self::cell(SingleChunkableModuleReference {
            asset,
            description,
            export: turbo_tasks::read!(export.owned())?,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for SingleChunkableModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.asset)
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: true,
            hoisted: false,
        })
    }

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage {
            import: ImportUsage::TopLevel,
            export: self.export.clone(),
        }
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
    include_binding_usage: bool,
) -> Result<Vc<ModulesWithRefData>> {
    let references = turbo_tasks::read!(module.references())?;
    // Hot path: keep the concurrent `try_join` in the async build; the per-reference
    // dual helper cannot fan out through `parallel!` under sync, so loop sequentially.
    #[cfg(not(feature = "sync"))]
    let resolved = {
        use turbo_tasks::TryJoinIterExt;
        references
            .iter()
            .map(|reference| reference_with_resolved_data(*reference, include_binding_usage))
            .try_join()
            .await?
    };
    #[cfg(feature = "sync")]
    let resolved = {
        let mut resolved = Vec::with_capacity(references.len());
        for reference in references.iter() {
            resolved.push(reference_with_resolved_data(
                *reference,
                include_binding_usage,
            )?);
        }
        resolved
    };
    let modules = resolved.into_iter().flatten().collect();
    Ok(Vc::cell(modules))
}

turbo_tasks::dual_fn! {
/// Per-reference step of [`referenced_modules_and_affecting_sources`]: resolves the
/// reference and collects its primary modules and affecting sources.
fn reference_with_resolved_data(
    reference: ResolvedVc<Box<dyn ModuleReference>>,
    include_binding_usage: bool,
) -> Result<Option<(ResolvedVc<Box<dyn ModuleReference>>, ResolvedReference)>> {
    let trait_ref = turbo_tasks::read!(reference.into_trait_ref())?;
    let resolve_result = turbo_tasks::read!(reference.resolve_reference())?;
    if let Some(chunking_type) = &trait_ref.chunking_type() {
        let mut modules = resolve_result
            .primary_modules_raw_iter()
            .collect::<Vec<_>>();
        // Keep the concurrent `try_join` in the async build; `.to_resolved()` futures
        // cannot fan out through `parallel!` under sync, so resolve sequentially.
        #[cfg(not(feature = "sync"))]
        modules.extend(
            {
                use turbo_tasks::TryJoinIterExt;
                resolve_result
                    .affecting_sources_iter()
                    .map(|source| RawModule::new(*source).to_resolved())
                    .try_join()
                    .await?
            }
            .into_iter()
            .map(ResolvedVc::upcast),
        );
        #[cfg(feature = "sync")]
        for source in resolve_result.affecting_sources_iter() {
            modules.push(ResolvedVc::upcast(turbo_tasks::read!(RawModule::new(
                *source
            )
            .to_resolved())?));
        }

        let binding_usage = if include_binding_usage {
            trait_ref.binding_usage()
        } else {
            BindingUsage::default()
        };

        return Ok(Some((
            reference,
            ResolvedReference {
                chunking_type: chunking_type.clone(),
                binding_usage,
                modules,
            },
        )));
    }
    Ok(None)
}
}

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("traced {}", self.module.ident())]
pub struct TracedModuleReference {
    module: ResolvedVc<Box<dyn Module>>,
    mode: TracedMode,
}

#[turbo_tasks::value_impl]
impl ModuleReference for TracedModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.module)
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Traced { mode: self.mode })
    }
}

#[turbo_tasks::value_impl]
impl TracedModuleReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>, mode: TracedMode) -> Vc<Self> {
        Self::cell(TracedModuleReference { module, mode })
    }
}

/// Aggregates all primary [`Module`]s referenced by an [`Module`]. This does not include
/// transitively references [`Module`]s, only includes primary [`Module`]s referenced.
///
/// [`Module`]: crate::module::Module
#[turbo_tasks::function]
pub async fn primary_referenced_modules(module: Vc<Box<dyn Module>>) -> Result<Vc<Modules>> {
    let mut set = HashSet::new();
    let references = turbo_tasks::read!(module.references())?;
    // Hot path: keep the concurrent `try_join` in the async build; the per-reference
    // dual helper cannot fan out through `parallel!` under sync, so loop sequentially.
    #[cfg(not(feature = "sync"))]
    let resolved = {
        use turbo_tasks::TryJoinIterExt;
        references
            .iter()
            .map(|reference| primary_modules_of_reference(*reference))
            .try_join()
            .await?
    };
    #[cfg(feature = "sync")]
    let resolved = {
        let mut resolved = Vec::with_capacity(references.len());
        for reference in references.iter() {
            resolved.push(primary_modules_of_reference(*reference)?);
        }
        resolved
    };
    let modules = resolved
        .into_iter()
        .flatten()
        .filter(|&module| set.insert(module))
        .collect();
    Ok(Vc::cell(modules))
}

turbo_tasks::dual_fn! {
/// Per-reference step of [`primary_referenced_modules`]: resolves the reference and
/// returns its primary modules.
fn primary_modules_of_reference(
    reference: ResolvedVc<Box<dyn ModuleReference>>,
) -> Result<Vec<ResolvedVc<Box<dyn Module>>>> {
    let resolve_result = turbo_tasks::read!(reference.resolve_reference())?;
    turbo_tasks::read!(resolve_result.primary_modules())
}
}

#[derive(Clone, Eq, PartialEq, ValueDebugFormat, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub struct ResolvedReference {
    pub chunking_type: ChunkingType,
    pub binding_usage: BindingUsage,
    pub modules: Vec<ResolvedVc<Box<dyn Module>>>,
}

#[turbo_tasks::value(transparent)]
pub struct ModulesWithRefData(Vec<(ResolvedVc<Box<dyn ModuleReference>>, ResolvedReference)>);

/// Aggregates all primary [Module]s referenced by an [Module] via [ModuleReference]s with a
/// non-empty chunking_type. This does not include transitively referenced [Module]s, only primary
/// [Module]s referenced.
///
/// [Module]: crate::module::Module
#[turbo_tasks::function]
pub async fn primary_chunkable_referenced_modules(
    module: ResolvedVc<Box<dyn Module>>,
    include_traced: bool,
    include_binding_usage: bool,
) -> Result<Vc<ModulesWithRefData>> {
    let references = turbo_tasks::read!(module.references())?;
    // Hot path: keep the concurrent `try_join` in the async build; the per-reference
    // dual helper cannot fan out through `parallel!` under sync, so loop sequentially.
    #[cfg(not(feature = "sync"))]
    let resolved = {
        use turbo_tasks::TryJoinIterExt;
        references
            .iter()
            .map(|reference| {
                chunkable_reference_with_resolved_data(
                    *reference,
                    include_traced,
                    include_binding_usage,
                )
            })
            .try_join()
            .await?
    };
    #[cfg(feature = "sync")]
    let resolved = {
        // The same reads as the async `try_join`, reordered so the expensive step fans
        // out: a module's `resolve_reference` chains are published to the pool up
        // front via `parallel!` — the serial loop claims each chain depth-first on
        // this one worker (the sync engine's longest serial critical path). `into_trait_ref` reads
        // are value-cell hits (cheap), so filtering stays serial and identical to the async
        // build.
        let mut eligible = Vec::with_capacity(references.len());
        for (i, reference) in references.iter().enumerate() {
            let trait_ref = turbo_tasks::read!(reference.into_trait_ref())?;
            if matches!(
                &trait_ref.chunking_type(),
                Some(chunking_type) if include_traced || !chunking_type.is_traced()
            ) {
                eligible.push((i, *reference, trait_ref));
            }
        }
        let resolve_results =
            turbo_tasks::parallel!(eligible.iter().map(|(_, r, _)| r.resolve_reference()))?;
        let mut resolved: Vec<Option<_>> = (0..references.len()).map(|_| None).collect();
        for ((i, reference, trait_ref), resolve_result) in
            eligible.into_iter().zip(resolve_results.iter())
        {
            // `primary_modules` is cheap (it only awaits on the rare `Unknown` error
            // path) and not a `Vc`, so it stays serial — the expensive chains were
            // fanned out above.
            let modules = resolve_result.primary_modules()?;
            let chunking_type = trait_ref
                .chunking_type()
                .expect("filtered to chunkable references above")
                .clone();
            let binding_usage = if include_binding_usage {
                trait_ref.binding_usage()
            } else {
                BindingUsage::default()
            };
            resolved[i] = Some((
                reference,
                ResolvedReference {
                    chunking_type,
                    binding_usage,
                    modules,
                },
            ));
        }
        resolved
    };
    let modules = resolved.into_iter().flatten().collect();
    Ok(Vc::cell(modules))
}

turbo_tasks::dual_fn! {
/// Per-reference step of [`primary_chunkable_referenced_modules`].
fn chunkable_reference_with_resolved_data(
    reference: ResolvedVc<Box<dyn ModuleReference>>,
    include_traced: bool,
    include_binding_usage: bool,
) -> Result<Option<(ResolvedVc<Box<dyn ModuleReference>>, ResolvedReference)>> {
    let trait_ref = turbo_tasks::read!(reference.into_trait_ref())?;
    if let Some(chunking_type) = &trait_ref.chunking_type() {
        if !include_traced && chunking_type.is_traced() {
            return Ok(None);
        }

        let resolve_result = turbo_tasks::read!(reference.resolve_reference())?;
        let resolved = turbo_tasks::read!(resolve_result.primary_modules())?;
        let binding_usage = if include_binding_usage {
            trait_ref.binding_usage()
        } else {
            BindingUsage::default()
        };

        return Ok(Some((
            reference,
            ResolvedReference {
                chunking_type: chunking_type.clone(),
                binding_usage,
                modules: resolved,
            },
        )));
    }
    Ok(None)
}
}

/// Walks the asset graph from multiple assets and collect all referenced
/// assets.
#[turbo_tasks::function]
pub async fn all_assets_from_entries(
    entries: Vc<OutputAssets>,
) -> Result<Vc<ExpandedOutputAssets>> {
    Ok(Vc::cell(turbo_tasks::read!(expand_output_assets(
        turbo_tasks::read!(entries)?
            .into_iter()
            .map(ExpandOutputAssetsInput::Asset),
        true,
    ))?))
}

/// Walks the asset graph from multiple assets and collect all referenced
/// assets.
#[turbo_tasks::function]
pub async fn all_assets_from_entry(
    entry: ResolvedVc<Box<dyn OutputAsset>>,
) -> Result<Vc<ExpandedOutputAssets>> {
    Ok(Vc::cell(turbo_tasks::read!(expand_output_assets(
        std::iter::once(ExpandOutputAssetsInput::Asset(entry)),
        true
    ))?))
}
