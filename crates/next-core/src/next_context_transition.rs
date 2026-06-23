//! Implements `experimental.turbopackContexts`: user-defined module contexts that inherit from a
//! built-in named transition (e.g. `next-rsc`) and layer extra resolve conditions and module rules
//! (loaders) on top.
//!
//! A derived context is registered as a named [`Transition`]. When source code opts into it via an
//! import attribute (`import x from './foo' with { 'turbopack-transition': 'my-ctx' }`), Turbopack
//! looks the name up in [`TransitionOptions::named_transitions`] and applies it. The transition
//! delegates to the inherited base context, then appends the configured overrides.

use anyhow::Result;
use async_trait::async_trait;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{
    ModuleAssetContext,
    module_options::{
        EmptyWebpackLoaderBuiltinConditionSet, ModuleOptionsContext, WebpackLoadersOptions,
        WebpackRules,
    },
    transition::Transition,
};
use turbopack_core::{
    ident::Layer,
    issue::{Issue, IssueExt, IssueStage, StyledString},
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::{
    next_config::{NextConfig, rule_collections_to_webpack_rules},
    next_shared::webpack_rules::loader_runner_package_mapping,
};

/// A transition derived from `experimental.turbopackContexts`. It inherits the inner
/// (`base`) transition's module/resolve options and appends extra resolve conditions and webpack
/// loader rules.
#[turbo_tasks::value]
pub struct NextContextTransition {
    /// The configured context name, used as the [`Layer`] for modules processed in this context.
    name: RcStr,
    base: ResolvedVc<Box<dyn Transition>>,
    resolve_conditions: Vec<RcStr>,
    extra_webpack_rules: ResolvedVc<WebpackRules>,
}

#[turbo_tasks::value_impl]
impl NextContextTransition {
    #[turbo_tasks::function]
    pub fn new(
        name: RcStr,
        base: ResolvedVc<Box<dyn Transition>>,
        resolve_conditions: Vec<RcStr>,
        extra_webpack_rules: ResolvedVc<WebpackRules>,
    ) -> Vc<Self> {
        NextContextTransition {
            name,
            base,
            resolve_conditions,
            extra_webpack_rules,
        }
        .cell()
    }
}

impl NextContextTransition {
    /// Append the configured resolve conditions to the inherited resolve options. The conditions
    /// are also applied to the nested per-path contexts (e.g. the `node_modules`/foreign-code
    /// context), since those override the top-level `custom_conditions` for modules they match.
    async fn extend_resolve_options_context(
        &self,
        resolve_options_context: ResolvedVc<ResolveOptionsContext>,
    ) -> Result<ResolvedVc<ResolveOptionsContext>> {
        if self.resolve_conditions.is_empty() {
            return Ok(resolve_options_context);
        }
        let mut resolve_options_context = resolve_options_context.owned().await?;
        resolve_options_context
            .custom_conditions
            .extend(self.resolve_conditions.iter().cloned());
        for (_, nested) in &mut resolve_options_context.rules {
            *nested = Box::pin(self.extend_resolve_options_context(*nested)).await?;
        }
        Ok(resolve_options_context.resolved_cell())
    }

    /// Merge the configured webpack loader rules into the inherited module options.
    async fn extend_module_options_context(
        &self,
        module_options_context: ResolvedVc<ModuleOptionsContext>,
    ) -> Result<ResolvedVc<ModuleOptionsContext>> {
        let extra_rules = self.extra_webpack_rules.await?;
        if extra_rules.is_empty() {
            return Ok(module_options_context);
        }

        let mut module_options_context = module_options_context.owned().await?;

        let merged_loaders = match module_options_context.enable_webpack_loaders {
            Some(existing) => {
                // Clone the inherited loader options and append our rules so both run.
                let existing = existing.await?;
                let mut rules = (*existing.rules.await?).clone();
                rules.extend(extra_rules.iter().cloned());
                WebpackLoadersOptions {
                    rules: ResolvedVc::cell(rules),
                    builtin_conditions: existing.builtin_conditions,
                    loader_runner_package: existing.loader_runner_package,
                }
            }
            None => {
                // The inherited context has no loaders configured. Build a fresh options object.
                // Built-in conditions can't be reconstructed here without the runtime, so use an
                // empty set; user rules referencing built-in conditions would be reported invalid.
                WebpackLoadersOptions {
                    rules: self.extra_webpack_rules,
                    builtin_conditions: EmptyWebpackLoaderBuiltinConditionSet::new()
                        .to_resolved()
                        .await?,
                    loader_runner_package: Some(
                        loader_runner_package_mapping().to_resolved().await?,
                    ),
                }
            }
        };

        module_options_context.enable_webpack_loaders = Some(merged_loaders.resolved_cell());
        Ok(module_options_context.resolved_cell())
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextContextTransition {
    /// Delegate compile-time info, transition options and source processing to the inherited
    /// transition; we only customize the module and resolve options below.
    #[turbo_tasks::function]
    async fn process_context(
        self: Vc<Self>,
        module_asset_context: Vc<ModuleAssetContext>,
    ) -> Result<Vc<ModuleAssetContext>> {
        let this = self.await?;
        // First let the base transition build its full context (this resolves the base's module
        // and resolve options).
        let base_context = this
            .base
            .process_context(module_asset_context)
            .to_resolved()
            .await?;
        let base_context_ref = base_context.await?;

        let resolve_options_context = this
            .extend_resolve_options_context(base_context_ref.resolve_options_context)
            .await?;
        let module_options_context = this
            .extend_module_options_context(base_context_ref.module_options_context)
            .await?;

        Ok(ModuleAssetContext::new(
            *base_context_ref.transitions,
            *base_context_ref.compile_time_info,
            *module_options_context,
            *resolve_options_context,
            Layer::new(this.name.clone()),
        ))
    }
}

/// Build the derived named transitions for `experimental.turbopackContexts`, resolving each
/// context's `inherits` against the provided built-in `named_transitions` map.
///
/// Returns `(name, transition)` pairs to be merged into the same map. Contexts whose `inherits`
/// names an unknown transition, or whose name collides with a built-in transition, are skipped and
/// an issue is emitted.
pub async fn get_context_transitions(
    next_config: Vc<NextConfig>,
    project_path: &FileSystemPath,
    named_transitions: &FxHashMap<RcStr, ResolvedVc<Box<dyn Transition>>>,
) -> Result<Vec<(RcStr, ResolvedVc<Box<dyn Transition>>)>> {
    let contexts = next_config.turbopack_contexts().await?;
    let Some(contexts) = contexts.as_ref() else {
        return Ok(Vec::new());
    };

    let config_file_path = next_config
        .config_file_path(project_path.clone())
        .owned()
        .await?;

    let mut derived = Vec::new();
    for (name, item) in contexts.iter() {
        if named_transitions.contains_key(name) {
            TurbopackContextIssue {
                config_file_path: config_file_path.clone(),
                message: format!(
                    "The context \"{name}\" collides with a built-in transition of the same name \
                     and will be ignored."
                )
                .into(),
            }
            .resolved_cell()
            .emit();
            continue;
        }

        let Some(base) = named_transitions.get(item.inherits()).copied() else {
            TurbopackContextIssue {
                config_file_path: config_file_path.clone(),
                message: format!(
                    "The context \"{name}\" inherits from \"{}\", which is not a known transition.",
                    item.inherits()
                )
                .into(),
            }
            .resolved_cell()
            .emit();
            continue;
        };

        let rules =
            rule_collections_to_webpack_rules(next_config, project_path, item.rules()).await?;
        let transition = NextContextTransition::new(
            name.clone(),
            *base,
            item.resolve_conditions().to_vec(),
            Vc::cell(rules),
        )
        .to_resolved()
        .await?;

        derived.push((name.clone(), ResolvedVc::upcast(transition)));
    }

    Ok(derived)
}

#[turbo_tasks::value(shared)]
struct TurbopackContextIssue {
    config_file_path: FileSystemPath,
    message: RcStr,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for TurbopackContextIssue {
    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.config_file_path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Config
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(
            "Invalid `experimental.turbopackContexts` configuration".into(),
        ))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.message.clone())))
    }
}
