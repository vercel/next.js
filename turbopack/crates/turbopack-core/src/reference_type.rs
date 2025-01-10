use std::fmt::Display;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, Vc};

use crate::{module::Module, resolve::ModulePart};

/// Named references to inner assets. Modules can used them to allow to
/// per-module aliases of some requests to already created module assets.
///
/// Name is usually in UPPER_CASE to make it clear that this is an inner asset.
#[turbo_tasks::value(transparent)]
pub struct InnerAssets(FxIndexMap<RcStr, ResolvedVc<Box<dyn Module>>>);

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

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
pub enum CommonJsReferenceSubType {
    Custom(u8),
    Undefined,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
pub enum ImportWithType {
    Json,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Default, Clone, Hash)]
pub enum EcmaScriptModulesReferenceSubType {
    ImportPart(ResolvedVc<ModulePart>),
    Import,
    ImportWithType(ImportWithType),
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
    pub async fn add_attributes(
        self: Vc<Self>,
        attr_layer: Option<RcStr>,
        attr_media: Option<RcStr>,
        attr_supports: Option<RcStr>,
    ) -> Result<Vc<Self>> {
        let this = &*self.await?;

        let layers = {
            let mut layers = this.layers.clone();
            if let Some(attr_layer) = attr_layer {
                if !layers.contains(&attr_layer) {
                    layers.push(attr_layer);
                }
            }
            layers
        };

        let media = {
            let mut media = this.media.clone();
            if let Some(attr_media) = attr_media {
                if !media.contains(&attr_media) {
                    media.push(attr_media);
                }
            }
            media
        };

        let supports = {
            let mut supports = this.supports.clone();
            if let Some(attr_supports) = attr_supports {
                if !supports.contains(&attr_supports) {
                    supports.push(attr_supports);
                }
            }
            supports
        };

        Ok(ImportContext::new(layers, media, supports))
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
                write!(modifier, "layer({})", layer)?
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
                write!(modifier, "supports({})", supports)?
            }
        }
        Ok(Vc::cell(modifier.into()))
    }
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
pub enum CssReferenceSubType {
    AtImport(Option<ResolvedVc<ImportContext>>),
    Compose,
    /// Reference from any asset to a CSS-parseable asset.
    ///
    /// This marks the boundary between non-CSS and CSS assets. The Next.js App
    /// Router implementation uses this to inject client references in-between
    /// Global/Module CSS assets and the underlying CSS assets.
    Internal,
    Custom(u8),
    Undefined,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
pub enum UrlReferenceSubType {
    EcmaScriptNewUrl,
    CssUrl,
    Custom(u8),
    Undefined,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
pub enum TypeScriptReferenceSubType {
    Custom(u8),
    Undefined,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
pub enum WorkerReferenceSubType {
    WebWorker,
    SharedWorker,
    ServiceWorker,
    Custom(u8),
    Undefined,
}

// TODO(sokra) this was next.js specific values. We want to solve this in a
// different way.
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
pub enum EntryReferenceSubType {
    Web,
    Page,
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

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
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
    Custom(u8),
    Undefined,
}

impl Display for ReferenceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // TODO print sub types
        let str = match self {
            ReferenceType::CommonJs(_) => "commonjs",
            ReferenceType::EcmaScriptModules(sub) => match sub {
                EcmaScriptModulesReferenceSubType::ImportPart(_) => "EcmaScript Modules (part)",
                _ => "EcmaScript Modules",
            },
            ReferenceType::Css(_) => "css",
            ReferenceType::Url(_) => "url",
            ReferenceType::TypeScript(_) => "typescript",
            ReferenceType::Worker(_) => "worker",
            ReferenceType::Entry(_) => "entry",
            ReferenceType::Runtime => "runtime",
            ReferenceType::Internal(_) => "internal",
            ReferenceType::Custom(_) => todo!(),
            ReferenceType::Undefined => "undefined",
        };
        f.write_str(str)
    }
}

impl ReferenceType {
    pub fn includes(&self, other: &Self) -> bool {
        if self == other {
            return true;
        }
        match self {
            ReferenceType::CommonJs(sub_type) => {
                matches!(other, ReferenceType::CommonJs(_))
                    && matches!(sub_type, CommonJsReferenceSubType::Undefined)
            }
            ReferenceType::EcmaScriptModules(sub_type) => {
                matches!(other, ReferenceType::EcmaScriptModules(_))
                    && matches!(sub_type, EcmaScriptModulesReferenceSubType::Undefined)
            }
            ReferenceType::Css(CssReferenceSubType::AtImport(_)) => {
                // For condition matching, treat any AtImport pair as identical.
                matches!(other, ReferenceType::Css(CssReferenceSubType::AtImport(_)))
            }
            ReferenceType::Css(sub_type) => {
                matches!(other, ReferenceType::Css(_))
                    && matches!(sub_type, CssReferenceSubType::Undefined)
            }
            ReferenceType::Url(sub_type) => {
                matches!(other, ReferenceType::Url(_))
                    && matches!(sub_type, UrlReferenceSubType::Undefined)
            }
            ReferenceType::TypeScript(sub_type) => {
                matches!(other, ReferenceType::TypeScript(_))
                    && matches!(sub_type, TypeScriptReferenceSubType::Undefined)
            }
            ReferenceType::Worker(sub_type) => {
                matches!(other, ReferenceType::Worker(_))
                    && matches!(sub_type, WorkerReferenceSubType::Undefined)
            }
            ReferenceType::Entry(sub_type) => {
                matches!(other, ReferenceType::Entry(_))
                    && matches!(sub_type, EntryReferenceSubType::Undefined)
            }
            ReferenceType::Runtime => matches!(other, ReferenceType::Runtime),
            ReferenceType::Internal(_) => matches!(other, ReferenceType::Internal(_)),
            ReferenceType::Custom(_) => {
                todo!()
            }
            ReferenceType::Undefined => true,
        }
    }

    /// Returns true if this reference type is internal. This will be used in
    /// combination with [`ModuleRuleCondition::Internal`] to determine if a
    /// rule should be applied to an internal asset/reference.
    pub fn is_internal(&self) -> bool {
        matches!(
            self,
            ReferenceType::Internal(_)
                | ReferenceType::Css(CssReferenceSubType::Internal)
                | ReferenceType::Runtime
        )
    }
}
