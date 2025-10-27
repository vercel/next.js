use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    environment::Environment, reference_type::ReferenceType, source::Source,
    source_transform::SourceTransforms,
};
use turbopack_css::CssModuleAssetType;
use turbopack_ecmascript::{EcmascriptInputTransforms, EcmascriptOptions};
use turbopack_wasm::source::WebAssemblySourceType;

use super::{CustomModuleType, RuleCondition, match_mode::MatchMode};

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, NonLocalValue)]
pub struct ModuleRule {
    condition: RuleCondition,
    effects: Vec<ModuleRuleEffect>,
    match_mode: MatchMode,
}

impl ModuleRule {
    /// Creates a new module rule. Will not match internal references.
    pub fn new(mut condition: RuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
        condition.flatten();
        ModuleRule {
            condition,
            effects,
            match_mode: MatchMode::NonInternal,
        }
    }

    /// Creates a new module rule. Will only match internal references.
    pub fn new_internal(mut condition: RuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
        condition.flatten();
        ModuleRule {
            condition,
            effects,
            match_mode: MatchMode::Internal,
        }
    }

    /// Creates a new module rule. Will match all references.
    pub fn new_all(mut condition: RuleCondition, effects: Vec<ModuleRuleEffect>) -> Self {
        condition.flatten();
        ModuleRule {
            condition,
            effects,
            match_mode: MatchMode::All,
        }
    }

    pub fn effects(&self) -> impl Iterator<Item = &ModuleRuleEffect> {
        self.effects.iter()
    }

    pub async fn matches(
        &self,
        source: ResolvedVc<Box<dyn Source>>,
        path: &FileSystemPath,
        reference_type: &ReferenceType,
    ) -> Result<bool> {
        Ok(self.match_mode.matches(reference_type)
            && self.condition.matches(source, path, reference_type).await?)
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub enum ModuleRuleEffect {
    ModuleType(ModuleType),
    /// Allow to extend an existing Ecmascript module rules for the additional
    /// transforms
    ExtendEcmascriptTransforms {
        /// Transforms to run first: transpile TypeScript, decorators, ...
        preprocess: ResolvedVc<EcmascriptInputTransforms>,
        /// Transforms to execute on standard EcmaScript (plus JSX): styled-jsx, swc plugins, ...
        main: ResolvedVc<EcmascriptInputTransforms>,
        /// Transforms to run last: JSX, preset-env, scan for imports, ...
        postprocess: ResolvedVc<EcmascriptInputTransforms>,
    },
    SourceTransforms(ResolvedVc<SourceTransforms>),
    Ignore,
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug, Clone)]
pub enum ModuleType {
    Ecmascript {
        /// Transforms to run first: transpile TypeScript, decorators, ...
        preprocess: ResolvedVc<EcmascriptInputTransforms>,
        /// Transforms to execute on standard EcmaScript (plus JSX): styled-jsx, swc plugins, ...
        main: ResolvedVc<EcmascriptInputTransforms>,
        /// Transforms to run last: JSX, preset-env, scan for imports, ...
        postprocess: ResolvedVc<EcmascriptInputTransforms>,
        #[turbo_tasks(trace_ignore)]
        options: ResolvedVc<EcmascriptOptions>,
    },
    Typescript {
        /// Transforms to run first: transpile TypeScript, decorators, ...
        preprocess: ResolvedVc<EcmascriptInputTransforms>,
        /// Transforms to execute on standard EcmaScript (plus JSX): styled-jsx, swc plugins, ...
        main: ResolvedVc<EcmascriptInputTransforms>,
        /// Transforms to run last: JSX, preset-env, scan for imports, ...
        postprocess: ResolvedVc<EcmascriptInputTransforms>,
        // parse JSX syntax.
        tsx: bool,
        // follow references to imported types.
        analyze_types: bool,
        #[turbo_tasks(trace_ignore)]
        options: ResolvedVc<EcmascriptOptions>,
    },
    TypescriptDeclaration {
        /// Transforms to run first: transpile TypeScript, decorators, ...
        preprocess: ResolvedVc<EcmascriptInputTransforms>,
        /// Transforms to execute on standard EcmaScript (plus JSX): styled-jsx, swc plugins, ...
        main: ResolvedVc<EcmascriptInputTransforms>,
        /// Transforms to run last: JSX, preset-env, scan for imports, ...
        postprocess: ResolvedVc<EcmascriptInputTransforms>,
        #[turbo_tasks(trace_ignore)]
        options: ResolvedVc<EcmascriptOptions>,
    },
    EcmascriptExtensionless {
        /// Transforms to run first: transpile TypeScript, decorators, ...
        preprocess: ResolvedVc<EcmascriptInputTransforms>,
        /// Transforms to execute on standard EcmaScript (plus JSX): styled-jsx, swc plugins, ...
        main: ResolvedVc<EcmascriptInputTransforms>,
        /// Transforms to run last: JSX, preset-env, scan for imports, ...
        postprocess: ResolvedVc<EcmascriptInputTransforms>,
        #[turbo_tasks(trace_ignore)]
        options: ResolvedVc<EcmascriptOptions>,
    },
    Json,
    Raw,
    NodeAddon,
    CssModule,
    Css {
        ty: CssModuleAssetType,
        environment: Option<ResolvedVc<Environment>>,
    },
    StaticUrlJs {
        /// The tag that is passed to ChunkingContext::asset_url
        tag: Option<RcStr>,
    },
    StaticUrlCss {
        /// The tag that is passed to ChunkingContext::asset_url
        tag: Option<RcStr>,
    },
    InlinedBytesJs,
    WebAssembly {
        source_ty: WebAssemblySourceType,
    },
    Custom(ResolvedVc<Box<dyn CustomModuleType>>),
}
