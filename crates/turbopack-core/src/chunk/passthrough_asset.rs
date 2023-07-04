use crate::asset::{Asset, AssetVc};

/// An [Asset] that should never be placed into a chunk, but whose references
/// should still be followed.
#[turbo_tasks::value_trait]
pub trait PassthroughAsset: Asset {}
