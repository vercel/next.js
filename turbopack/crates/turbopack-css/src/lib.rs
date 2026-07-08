#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod asset;
pub mod chunk;
mod code_gen;
pub mod embed;
mod lifetime_util;
mod module_asset;
pub(crate) mod process;
pub(crate) mod references;

use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::trace::TraceRawVcs;

use crate::references::import::ImportAssetReference;
pub use crate::{asset::CssModule, module_asset::EcmascriptCssModule, process::*};

#[turbo_tasks::task_input]
#[derive(
    PartialOrd, Ord, Eq, PartialEq, Hash, Debug, Copy, Clone, Default, TraceRawVcs, Encode, Decode,
)]
pub enum CssModuleType {
    /// Default parsing mode.
    #[default]
    Default,
    /// The CSS is parsed as CSS modules.
    Module,
}

/// User-specified lightningcss feature flags (from `experimental.lightningCssFeatures`).
///
/// Both fields are raw `Features` bitmasks. `include` bits are OR-ed into the
/// default feature set; `exclude` bits are masked off.
#[turbo_tasks::value(shared, serialization = "auto", task_input)]
#[derive(PartialOrd, Ord, Hash, Copy, Clone, Debug, Default)]
pub struct LightningCssFeatureFlags {
    pub include: u32,
    pub exclude: u32,
}

/// User-specified lightningcss options that are passed through to lightningcss
/// when Turbopack processes CSS.
///
/// This is the aggregate of the individual `experimental.lightningCss*` config
/// keys. It is threaded from the module options context down to the CSS parser.
#[turbo_tasks::value(shared, serialization = "auto", task_input)]
#[derive(PartialOrd, Ord, Hash, Clone, Debug, Default)]
pub struct LightningCssOptions {
    /// Feature `include`/`exclude` bitmasks (from `lightningCssFeatures`).
    pub features: LightningCssFeatureFlags,
    /// CSS-modules configuration (from `lightningCss.cssModules`).
    pub css_modules: LightningCssModulesOptions,
}

/// Passthrough configuration for lightningcss CSS modules.
///
/// Mirrors the relevant fields of lightningcss' [`css_modules::Config`]. Fields
/// left at their defaults preserve Next.js' built-in behavior.
///
/// [`css_modules::Config`]: lightningcss::css_modules::Config
#[turbo_tasks::value(shared, serialization = "auto", task_input)]
#[derive(PartialOrd, Ord, Hash, Clone, Debug, Default)]
pub struct LightningCssModulesOptions {
    /// The class-name pattern in lightningcss syntax, e.g.
    /// `[name]__[hash]__[local]`. `None` uses the Next.js default pattern.
    ///
    /// Recognized placeholders: `[name]`, `[local]`, `[hash]`,
    /// `[content-hash]`. Any other text is treated as a literal.
    pub pattern: Option<RcStr>,
    /// Whether to rename dashed identifiers (e.g. CSS custom properties).
    pub dashed_idents: bool,
}
