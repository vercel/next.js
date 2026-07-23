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

/// User-specified lightningcss CSS Modules options (from
/// `experimental.lightningCssModules`).
///
/// `None` fields fall back to the defaults in `process_content`, which match
/// the previously hardcoded behavior.
#[turbo_tasks::value(shared, serialization = "auto", task_input)]
#[derive(PartialOrd, Ord, Hash, Clone, Debug, Default)]
pub struct CssModulesOptions {
    /// Custom naming pattern for scoped names, e.g. `"[hash]-[local]"`.
    /// Supported placeholders: `[name]`, `[local]`, `[hash]`,
    /// `[content-hash]`. Defaults to `"[name]__[hash]__[local]"`.
    pub pattern: Option<RcStr>,
    /// Whether to scope `@keyframes` names. Defaults to `true`.
    pub animation: Option<bool>,
    /// Whether to scope CSS grid line names. Defaults to `false`.
    pub grid: Option<bool>,
    /// Whether to scope `custom-ident` values. Defaults to `true`.
    pub custom_idents: Option<bool>,
    /// Whether to scope dashed idents (custom properties). Defaults to
    /// `false`.
    pub dashed_idents: Option<bool>,
    /// Whether to scope `@container` names. Defaults to `false`.
    pub container: Option<bool>,
}
