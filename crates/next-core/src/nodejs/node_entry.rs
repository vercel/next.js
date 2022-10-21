use anyhow::Result;
use turbopack_ecmascript::EcmascriptModuleAssetVc;

/// Trait that allows to get the entry module for rendering something in Node.js
#[turbo_tasks::value_trait]
pub trait NodeEntry {
    fn entry(&self) -> EcmascriptModuleAssetVc;
}
