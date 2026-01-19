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
pub use crate::{asset::CssModuleAsset, module_asset::ModuleCssAsset, process::*};

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
pub enum CssModuleAssetType {
    /// Default parsing mode.
    #[default]
    Default,
    /// The CSS is parsed as CSS modules.
    Module,
}
