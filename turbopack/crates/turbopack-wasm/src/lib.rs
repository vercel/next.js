//! WebAssembly support for turbopack.
//!
//! WASM assets are copied directly to the output folder.
//!
//! When imported from ES modules, they produce a thin module that loads and
//! instantiates the WebAssembly module.

#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

// Force linking `turbo-tasks-backend`'s `__tt_static_*` providers into
// this crate's test binary; see the matching dev-dep in `Cargo.toml`.
#[cfg(test)]
extern crate turbo_tasks_backend;

use anyhow::{Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::asset::{Asset, no_hash_salt};

pub(crate) mod analysis;
pub(crate) mod loader;
pub mod module_asset;
pub(crate) mod output_asset;
pub mod raw;
pub mod source;

#[turbo_tasks::function]
pub async fn wasm_edge_var_name(asset: Vc<Box<dyn Asset>>) -> Result<Vc<RcStr>> {
    let hash = asset
        .content()
        .content_hash(no_hash_salt(), HashAlgorithm::Xxh3Hash128Hex)
        .await?;
    let hash = hash
        .as_ref()
        .context("Missing content when trying to generate the content hash for a WASM asset")?;
    Ok(Vc::cell(format!("wasm_{}", hash).into()))
}
