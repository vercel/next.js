#![feature(min_specialization)]
#![feature(box_patterns)]
#![feature(iter_intersperse)]
#![feature(int_roundings)]

mod asset;
pub mod chunk;
mod code_gen;
pub mod embed;
mod global_asset;
mod module_asset;
pub(crate) mod parse;
mod path_visitor;
pub(crate) mod references;
pub(crate) mod transform;
pub(crate) mod util;

use anyhow::Result;
pub use asset::CssModuleAssetVc;
pub use global_asset::GlobalCssAssetVc;
pub use module_asset::ModuleCssAssetVc;
pub use parse::{ParseCss, ParseCssResult, ParseCssResultVc, ParseCssVc};
use serde::{Deserialize, Serialize};
pub use transform::{CssInputTransform, CssInputTransformsVc};
use turbo_tasks::{trace::TraceRawVcs, TaskInput};

use crate::references::import::ImportAssetReferenceVc;

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
    Serialize,
    Deserialize,
    TaskInput,
    TraceRawVcs,
)]
pub enum CssModuleAssetType {
    /// Default parsing mode.
    #[default]
    Default,
    /// The CSS is parsed as CSS modules.
    Module,
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
