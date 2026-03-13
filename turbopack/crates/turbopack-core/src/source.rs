use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{asset::Asset, ident::AssetIdent};

/// Unparsed input source code. Source code is processed into [`Module`]s by the [`AssetContext`].
/// All `Source`s have content and an identifier.
///
/// [`Module`]: crate::module::Module
/// [`AssetContext`]: crate::context::AssetContext
#[turbo_tasks::value_trait]
pub trait Source: Asset {
    /// The identifier of the [Source]. It's expected to be unique and capture
    /// all properties of the [Source].
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent>;

    /// A human-readable description of this source, explaining where the code
    /// comes from. For sources that transform another source, this should
    /// include the inner source's description, creating a readable chain
    /// like `"loaders [sass-loader] transform of file content of
    /// ./styles.scss"`.
    #[turbo_tasks::function]
    fn description(&self) -> Vc<RcStr>;
}

#[turbo_tasks::value(transparent)]
pub struct OptionSource(Option<ResolvedVc<Box<dyn Source>>>);

#[turbo_tasks::value(transparent)]
pub struct Sources(Vec<ResolvedVc<Box<dyn Source>>>);
