use std::fmt::Display;

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    environment::Environment, reference_type::ReferenceType, source::Source,
    source_transform::SourceTransforms,
};
use turbopack_css::CssModuleAssetType;
use turbopack_ecmascript::{
    EcmascriptInputTransforms, EcmascriptOptions, bytes_source_transform::BytesSourceTransform,
    json_source_transform::JsonSourceTransform,
};
use turbopack_wasm::source::WebAssemblySourceType;

use crate::module_options::{CustomModuleType, RuleCondition, match_mode::MatchMode};

#[derive(Debug, Clone, TraceRawVcs, PartialEq, Eq, NonLocalValue, Encode, Decode)]
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
    WebAssembly {
        source_ty: WebAssemblySourceType,
    },
    Custom(ResolvedVc<Box<dyn CustomModuleType>>),
}

impl Display for ModuleType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModuleType::Ecmascript { .. } => write!(f, "Ecmascript"),
            ModuleType::Typescript { .. } => write!(f, "Typescript"),
            ModuleType::TypescriptDeclaration { .. } => write!(f, "TypescriptDeclaration"),
            ModuleType::EcmascriptExtensionless { .. } => write!(f, "EcmascriptExtensionless"),
            ModuleType::Raw => write!(f, "Raw"),
            ModuleType::NodeAddon => write!(f, "NodeAddon"),
            ModuleType::CssModule => write!(f, "CssModule"),
            ModuleType::Css { .. } => write!(f, "Css"),
            ModuleType::StaticUrlJs { .. } => write!(f, "StaticUrlJs"),
            ModuleType::StaticUrlCss { .. } => write!(f, "StaticUrlCss"),
            ModuleType::WebAssembly { .. } => write!(f, "WebAssembly"),
            ModuleType::Custom(_) => write!(f, "Custom"),
        }
    }
}

/// User-facing module type names used in configuration.
///
/// This enum represents the semantic module types that users can specify in their config
/// (e.g., next.config.js turbopack rules). Some of these map directly to internal `ModuleType`
/// variants, while others (like `Bytes`) are implemented via source transforms.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfiguredModuleType {
    Asset,
    Ecmascript,
    Typescript,
    Css,
    CssModule,
    /// Parses JSON and exports it as an ES module default export.
    /// Implemented as a source transform, not a ModuleType.
    Json,
    Wasm,
    Raw,
    Node,
    /// Converts any file to an ES module exporting its contents as a Uint8Array.
    /// Implemented as a source transform, not a ModuleType.
    Bytes,
}

impl ConfiguredModuleType {
    /// Parse a module type string from user configuration.
    pub fn parse(type_str: &str) -> Result<Self> {
        Ok(match type_str {
            "asset" => ConfiguredModuleType::Asset,
            "ecmascript" => ConfiguredModuleType::Ecmascript,
            "typescript" => ConfiguredModuleType::Typescript,
            "css" => ConfiguredModuleType::Css,
            "css-module" => ConfiguredModuleType::CssModule,
            "json" => ConfiguredModuleType::Json,
            "wasm" => ConfiguredModuleType::Wasm,
            "raw" => ConfiguredModuleType::Raw,
            "node" => ConfiguredModuleType::Node,
            "bytes" => ConfiguredModuleType::Bytes,
            _ => bail!(
                "Unknown module type: {type_str:?}. Valid types are: asset, ecmascript, \
                 typescript, css, css-module, json, wasm, raw, node, bytes"
            ),
        })
    }

    /// Convert this configured module type into module rule effects.
    ///
    /// Some module types (like `Bytes`) are implemented as source transforms rather than
    /// `ModuleType` variants, allowing them to compose with the standard Ecmascript pipeline.
    pub async fn into_effect(
        self,
        preprocess: ResolvedVc<EcmascriptInputTransforms>,
        main: ResolvedVc<EcmascriptInputTransforms>,
        postprocess: ResolvedVc<EcmascriptInputTransforms>,
        options: ResolvedVc<EcmascriptOptions>,
        environment: Option<ResolvedVc<Environment>>,
    ) -> Result<ModuleRuleEffect> {
        Ok(match self {
            ConfiguredModuleType::Bytes => {
                // Use source transform instead of ModuleType - the transform produces .mjs
                // which gets picked up by the standard Ecmascript rules
                ModuleRuleEffect::SourceTransforms(ResolvedVc::cell(vec![ResolvedVc::upcast(
                    BytesSourceTransform::new().to_resolved().await?,
                )]))
            }
            ConfiguredModuleType::Asset => {
                ModuleRuleEffect::ModuleType(ModuleType::StaticUrlJs { tag: None })
            }
            ConfiguredModuleType::Ecmascript => {
                ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    preprocess,
                    main,
                    postprocess,
                    options,
                })
            }
            ConfiguredModuleType::Typescript => {
                ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    preprocess,
                    main,
                    postprocess,
                    tsx: false,
                    analyze_types: false,
                    options,
                })
            }
            ConfiguredModuleType::Css => ModuleRuleEffect::ModuleType(ModuleType::Css {
                ty: CssModuleAssetType::Default,
                environment,
            }),
            ConfiguredModuleType::CssModule => ModuleRuleEffect::ModuleType(ModuleType::CssModule),
            ConfiguredModuleType::Json => {
                ModuleRuleEffect::SourceTransforms(ResolvedVc::cell(vec![ResolvedVc::upcast(
                    // TODO: can we switch this to `new_esm`?
                    JsonSourceTransform::new_cjs().to_resolved().await?,
                )]))
            }
            ConfiguredModuleType::Wasm => ModuleRuleEffect::ModuleType(ModuleType::WebAssembly {
                source_ty: WebAssemblySourceType::Binary,
            }),
            ConfiguredModuleType::Raw => ModuleRuleEffect::ModuleType(ModuleType::Raw),
            ConfiguredModuleType::Node => ModuleRuleEffect::ModuleType(ModuleType::NodeAddon),
        })
    }
}
