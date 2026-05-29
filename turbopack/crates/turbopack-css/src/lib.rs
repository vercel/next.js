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

use std::borrow::Cow;

use bincode::{Decode, Encode};
use turbo_rcstr::rcstr;
use turbo_tasks::{NonLocalValue, TaskInput, trace::TraceRawVcs};
use turbopack_core::module_graph::binding_usage_info::ModuleExportUsageInfo;

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

fn normalize_module_export_usage_for_css_module(
    export_usage_info: &'_ ModuleExportUsageInfo,
) -> Cow<'_, ModuleExportUsageInfo> {
    if let ModuleExportUsageInfo::Exports(exports) = export_usage_info
        && exports.contains(&rcstr!("default"))
    {
        // Deopt, some module might have done `import styles from ...`.
        Cow::Owned(ModuleExportUsageInfo::All)
    } else {
        Cow::Borrowed(export_usage_info)
    }
}
