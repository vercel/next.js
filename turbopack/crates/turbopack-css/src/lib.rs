#![feature(min_specialization)]
#![feature(box_patterns)]
#![feature(iter_intersperse)]
#![feature(int_roundings)]
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
pub(crate) mod util;

use bincode::{Decode, Encode};
use turbo_tasks::{NonLocalValue, TaskInput, trace::TraceRawVcs};

use crate::references::import::ImportAssetReference;
pub use crate::{asset::CssModule, module_asset::EcmascriptCssModule, process::*};

#[derive(
    PartialOrd,
    Ord,
    Eq,
    PartialEq,
    Hash,
    Debug,
    Copy,
    Clone,
    Default,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
    Encode,
    Decode,
)]
pub enum CssModuleType {
    /// Default parsing mode.
    #[default]
    Default,
    /// The CSS is parsed as CSS modules.
    Module,
}

/// Controls how CSS module class names are exported to JavaScript.
///
/// Matches the behavior of webpack's `css-loader` `modules.exportLocalsConvention` option.
#[turbo_tasks::value(shared, serialization = "auto")]
#[derive(PartialOrd, Ord, Hash, Copy, Clone, Debug, Default, TaskInput)]
pub enum CssModuleExportConvention {
    /// Export class names as-is (e.g. `.main-content` → `styles["main-content"]`).
    #[default]
    AsIs,
    /// Export both the original and camelCased name (all delimiters: `-`, `_`, `.`, ` `).
    CamelCase,
    /// Export only the camelCased name.
    CamelCaseOnly,
    /// Export both the original and dashes-to-camelCase name (hyphens only).
    Dashes,
    /// Export only the dashes-to-camelCase name.
    DashesOnly,
}

/// User-specified lightningcss feature flags (from `experimental.lightningCssFeatures`).
///
/// Both fields are raw `Features` bitmasks. `include` bits are OR-ed into the
/// default feature set; `exclude` bits are masked off.
#[turbo_tasks::value(shared, serialization = "auto")]
#[derive(PartialOrd, Ord, Hash, Copy, Clone, Debug, Default, TaskInput)]
pub struct LightningCssFeatureFlags {
    pub include: u32,
    pub exclude: u32,
}
