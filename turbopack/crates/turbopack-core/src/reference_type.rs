use std::fmt::Display;

use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};

use crate::{loader::ResolvedWebpackLoaderItem, module::Module, resolve::ModulePart};

/// Named references to inner assets. Modules can use them to allow to
/// per-module aliases of some requests to already created module assets.
///
/// Name is usually in UPPER_CASE to make it clear that this is an inner asset.
#[turbo_tasks::value(transparent)]
pub struct InnerAssets(
    #[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<RcStr, ResolvedVc<Box<dyn Module>>>,
);

#[turbo_tasks::value_impl]
impl InnerAssets {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(FxIndexMap::default())
    }
}

// These enums list well-known types, which we use internally. Plugins might add
// custom types too.

// TODO when plugins are supported, replace u8 with a trait that defines the
// behavior.

#[derive(
    PartialEq,
    Eq,
    TraceRawVcs,
    NonLocalValue,
    Debug,
    Default,
    Clone,
    Copy,
    Hash,
    TaskInput,
    Encode,
    Decode,
)]
pub enum CommonJsReferenceSubType {
    Custom(u8),
    #[default]
    Undefined,
}

#[derive(
    PartialEq, Eq, TraceRawVcs, NonLocalValue, Debug, Clone, Copy, Hash, TaskInput, Encode, Decode,
)]
pub enum ImportWithType {
    Json,
    Bytes,
}

#[derive(
    PartialEq,
    Eq,
    TraceRawVcs,
    NonLocalValue,
    Debug,
    Default,
    Clone,
    Hash,
    TaskInput,
    Encode,
    Decode,
)]
pub enum EcmaScriptModulesReferenceSubType {
    ImportPart(ModulePart),
    Import,
    /// Used for `importModule()` in webpack loaders, where a module and its
    /// transitive dependencies are compiled and executed in a loader context.
    ImportModule,
    ImportWithType(RcStr),
    /// Import with `turbopackLoader` attribute specifying an inline loader.
    ImportWithTurbopackUse {
        loader: ResolvedWebpackLoaderItem,
        rename_as: Option<RcStr>,
        module_type: Option<RcStr>,
    },
    DynamicImport,
    Custom(u8),
    #[default]
    Undefined,
}

/// The individual set of conditions present on this module through `@import`
#[derive(Debug)]
#[turbo_tasks::value(shared)]
pub struct ImportAttributes {
    pub layer: Option<RcStr>,
    pub supports: Option<RcStr>,
    pub media: Option<RcStr>,
}

impl ImportAttributes {
    pub fn is_empty(&self) -> bool {
        self.layer.is_none() && self.supports.is_none() && self.media.is_none()
    }
}

/// The accumulated list of conditions that should be applied to this module
/// through its import path
#[derive(Debug, Default)]
#[turbo_tasks::value]
pub struct ImportContext {
    pub layers: Vec<RcStr>,
    pub supports: Vec<RcStr>,
    pub media: Vec<RcStr>,
}

#[turbo_tasks::value_impl]
impl ImportContext {
    #[turbo_tasks::function]
    pub fn new(layers: Vec<RcStr>, media: Vec<RcStr>, supports: Vec<RcStr>) -> Vc<Self> {
        ImportContext {
            layers,
            media,
            supports,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn add_attributes(
        &self,
        attr_layer: Option<RcStr>,
        attr_media: Option<RcStr>,
        attr_supports: Option<RcStr>,
    ) -> Vc<Self> {
        let layers = {
            let mut layers = self.layers.clone();
            if let Some(attr_layer) = attr_layer
                && !layers.contains(&attr_layer)
            {
                layers.push(attr_layer);
            }
            layers
        };

        let media = {
            let mut media = self.media.clone();
            if let Some(attr_media) = attr_media
                && !media.contains(&attr_media)
            {
                media.push(attr_media);
            }
            media
        };

        let supports = {
            let mut supports = self.supports.clone();
            if let Some(attr_supports) = attr_supports
                && !supports.contains(&attr_supports)
            {
                supports.push(attr_supports);
            }
            supports
        };

        ImportContext::new(layers, media, supports)
    }

    #[turbo_tasks::function]
    pub fn modifier(&self) -> Result<Vc<RcStr>> {
        use std::fmt::Write;
        let mut modifier = String::new();
        if !self.layers.is_empty() {
            for (i, layer) in self.layers.iter().enumerate() {
                if i > 0 {
                    modifier.push(' ');
                }
                write!(modifier, "layer({layer})")?
            }
        }
        if !self.media.is_empty() {
            if !modifier.is_empty() {
                modifier.push(' ');
            }
            for (i, media) in self.media.iter().enumerate() {
                if i > 0 {
                    modifier.push_str(" and ");
                }
                modifier.push_str(media);
            }
        }
        if !self.supports.is_empty() {
            if !modifier.is_empty() {
                modifier.push(' ');
            }
            for (i, supports) in self.supports.iter().enumerate() {
                if i > 0 {
                    modifier.push(' ');
                }
                write!(modifier, "supports({supports})")?
            }
        }
        Ok(Vc::cell(modifier.into()))
    }
}

#[derive(
    PartialEq,
    Eq,
    TraceRawVcs,
    NonLocalValue,
    Debug,
    Default,
    Clone,
    Copy,
    Hash,
    TaskInput,
    Encode,
    Decode,
)]
pub enum CssReferenceSubType {
    AtImport(Option<ResolvedVc<ImportContext>>),
    /// Reference from EcmascriptCssModule to an imported EcmascriptCssModule for retrieving the
    /// composed class name
    Compose,
    /// Reference from EcmascriptCssModule to the CssModule
    Inner,
    /// Used for generating the list of classes in a EcmascriptCssModule
    Analyze,
    Custom(u8),
    #[default]
    Undefined,
}

#[derive(
    PartialEq,
    Eq,
    TraceRawVcs,
    NonLocalValue,
    Debug,
    Default,
    Clone,
    Copy,
    Hash,
    TaskInput,
    Encode,
    Decode,
)]
pub enum UrlReferenceSubType {
    EcmaScriptNewUrl,
    CssUrl,
    Custom(u8),
    #[default]
    Undefined,
}

#[derive(
    PartialEq, Eq, TraceRawVcs, NonLocalValue, Debug, Clone, Copy, Hash, TaskInput, Encode, Decode,
)]
pub enum TypeScriptReferenceSubType {
    Custom(u8),
    Undefined,
}

#[derive(
    PartialEq, Eq, TraceRawVcs, NonLocalValue, Debug, Clone, Copy, Hash, TaskInput, Encode, Decode,
)]
pub enum WorkerReferenceSubType {
    WebWorker,
    SharedWorker,
    ServiceWorker,
    NodeWorker,
    Custom(u8),
    Undefined,
}

// TODO(sokra) this was next.js specific values. We want to solve this in a
// different way.
#[derive(
    PartialEq, Eq, TraceRawVcs, NonLocalValue, Debug, Clone, Copy, Hash, TaskInput, Encode, Decode,
)]
pub enum EntryReferenceSubType {
    Web,
    Page,
    // A development only type that is used in pages router to differentiate between server prop
    // changes and template changes.
    PageData,
    PagesApi,
    AppPage,
    AppRoute,
    AppClientComponent,
    Middleware,
    Instrumentation,
    Runtime,
    Custom(u8),
    Undefined,
}

#[derive(
    PartialEq,
    Eq,
    TraceRawVcs,
    NonLocalValue,
    Debug,
    Default,
    Clone,
    Hash,
    TaskInput,
    Encode,
    Decode,
)]
pub enum ReferenceType {
    CommonJs(CommonJsReferenceSubType),
    EcmaScriptModules(EcmaScriptModulesReferenceSubType),
    Css(CssReferenceSubType),
    Url(UrlReferenceSubType),
    TypeScript(TypeScriptReferenceSubType),
    Worker(WorkerReferenceSubType),
    Entry(EntryReferenceSubType),
    Runtime,
    Internal(ResolvedVc<InnerAssets>),
    Loader,
    Custom(u8),
    #[default]
    Undefined,
}

impl Display for ReferenceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // TODO print sub types
        let str = match self {
            ReferenceType::CommonJs(_) => "commonjs",
            ReferenceType::EcmaScriptModules(sub) => match sub {
                EcmaScriptModulesReferenceSubType::ImportPart(_) => "EcmaScript Modules (part)",
                EcmaScriptModulesReferenceSubType::ImportWithTurbopackUse { .. } => {
                    "EcmaScript Modules (turbopackUse)"
                }
                _ => "EcmaScript Modules",
            },
            ReferenceType::Css(_) => "css",
            ReferenceType::Url(_) => "url",
            ReferenceType::TypeScript(_) => "typescript",
            ReferenceType::Worker(_) => "worker",
            ReferenceType::Entry(_) => "entry",
            ReferenceType::Runtime => "runtime",
            ReferenceType::Internal(_) => "internal",
            ReferenceType::Loader => "loader",
            ReferenceType::Custom(_) => todo!(),
            ReferenceType::Undefined => "undefined",
        };
        f.write_str(str)
    }
}

impl ReferenceType {
    /// Returns `true` if this reference type is internal. This is used by
    /// `turbopack::module_options::module_rule::ModuleRule::new_internal` to determine if a rule
    /// should be applied to an internal reference.
    pub fn is_internal(&self) -> bool {
        matches!(
            self,
            ReferenceType::Internal(_) | ReferenceType::Runtime | ReferenceType::Loader
        )
    }
}

/// A type to match [`ReferenceType`] against. This is used in conditions to determine if a rule
/// should be applied to a reference of a given type. It allows
/// - to match against a ReferenceType, e.g. with `ReferenceTypeCondition::Url(None)` matching any
///   `ReferenceType::Url(_)`, or
/// - to match against a specific subtype, e.g. with
///   `ReferenceTypeCondition::Url(Some(UrlReferenceSubType::EcmaScriptNewUrl))` matching
///   `ReferenceType::Url(UrlReferenceSubType::EcmaScriptNewUrl)`
#[derive(
    PartialEq, Eq, TraceRawVcs, NonLocalValue, Debug, Clone, Hash, TaskInput, Encode, Decode,
)]
pub enum ReferenceTypeCondition {
    CommonJs(Option<CommonJsReferenceSubType>),
    EcmaScriptModules(Option<EcmaScriptModulesReferenceSubType>),
    Css(Option<CssReferenceSubType>),
    Url(Option<UrlReferenceSubType>),
    TypeScript(Option<TypeScriptReferenceSubType>),
    Worker(Option<WorkerReferenceSubType>),
    Entry(Option<EntryReferenceSubType>),
    Runtime,
    Internal,
    Loader,
    Custom(u8),
}

impl ReferenceTypeCondition {
    pub fn includes(&self, other: &ReferenceType) -> bool {
        if matches!(
            self,
            ReferenceTypeCondition::Css(Some(CssReferenceSubType::AtImport(_)))
        ) && matches!(other, ReferenceType::Css(CssReferenceSubType::AtImport(_)))
        {
            // For condition matching, treat any AtImport pair as identical.
            return true;
        }

        if matches!(self, ReferenceTypeCondition::Custom(_)) {
            todo!()
        }

        macro_rules! match_condition_includes {
            (
                $self:expr, $other:expr,
                optional: [$($opt:ident),* $(,)?],
                unit: [$($unit:ident),* $(,)?],
                value: [$($val:ident),* $(,)?]
                $(,)?
            ) => {
                match $self {
                    $(
                        ReferenceTypeCondition::$opt(sub_type) => {
                            if let ReferenceType::$opt(other_sub_type) = $other {
                                return sub_type.as_ref().is_none_or(|s| s == other_sub_type);
                            }
                        }
                    )*
                    $(
                        ReferenceTypeCondition::$unit => {
                            return matches!($other, ReferenceType::$unit { .. });
                        }
                    )*
                    $(
                        ReferenceTypeCondition::$val(v) => {
                            if let ReferenceType::$val(ov) = $other {
                                return v == ov;
                            }
                        }
                    )*
                }
            };
        }
        match_condition_includes!(
            self, other,
            optional: [CommonJs, EcmaScriptModules, Css, Url, TypeScript, Worker, Entry],
            unit: [Runtime, Loader, Internal],
            value: [Custom],
        );

        false
    }
}
