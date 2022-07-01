use std::{mem::replace, sync::Mutex};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{get_invalidator, trace::TraceRawVcs, Invalidator};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use crate::{
    asset::{Asset, AssetVc},
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::ResolveResultVc,
};

#[derive(Serialize, Deserialize, TraceRawVcs)]
enum LazyAssetState {
    /// neither content() or references() was requested
    Idle,
    /// references() was requested by content() wasn't
    /// Once content() is requested the [Invalidator] should be invalidated when
    /// state was changed to [LazyAssetState::Expanded]
    Waiting(Invalidator),
    /// content() was requested. We don't store if references() was requested.
    Expanded,
}

/// Asset decorator that only expands references of an asset when the content
/// has been read.
/// It does that by keeping some state. See [LazyAssetState]
#[turbo_tasks::value(Asset, eq: manual, serialization: none)]
pub struct LazyAsset {
    asset: AssetVc,
    state: Mutex<LazyAssetState>,
}

impl PartialEq for LazyAsset {
    fn eq(&self, other: &Self) -> bool {
        self.asset == other.asset
    }
}

impl Eq for LazyAsset {}

#[turbo_tasks::value_impl]
impl LazyAssetVc {
    #[turbo_tasks::function]
    pub fn new(asset: AssetVc) -> Self {
        Self::slot(LazyAsset {
            asset,
            state: Mutex::new(LazyAssetState::Idle),
        })
    }
}

#[turbo_tasks::value_impl]
impl Asset for LazyAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.asset.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        {
            let mut state = self.state.lock().unwrap();
            if let LazyAssetState::Waiting(invalidator) =
                replace(&mut *state, LazyAssetState::Expanded)
            {
                invalidator.invalidate();
            }
        }
        self.asset.content()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        let mut state = self.state.lock().unwrap();
        match &*state {
            LazyAssetState::Idle => {
                *state = LazyAssetState::Waiting(get_invalidator());
                AssetReferencesVc::slot(Vec::new())
            }
            LazyAssetState::Waiting(_) => unreachable!(),
            LazyAssetState::Expanded => self.asset.references(),
        }
    }
}

/// An [AssetReference] decorator that wraps the resulting [Asset]s in a
/// [LazyAsset]
#[turbo_tasks::value(AssetReference)]
struct LazyAssetReference {
    reference: AssetReferenceVc,
}

#[turbo_tasks::value_impl]
impl LazyAssetReferenceVc {
    #[turbo_tasks::function]
    fn new(reference: AssetReferenceVc) -> Self {
        Self::slot(LazyAssetReference { reference })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for LazyAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let result = self.reference.resolve_reference().await?;
        Ok(result
            .map(
                |a| async move { Ok(LazyAssetVc::new(a).into()) },
                |r| async move { Ok(LazyAssetReferenceVc::new(r).into()) },
            )
            .await?
            .into())
    }

    #[turbo_tasks::function]
    fn description(&self) -> turbo_tasks::primitives::StringVc {
        self.reference.description()
    }
}
