use turbo_tasks::{ResolvedVc, Vc};

use crate::{asset::Asset, ident::AssetIdent};

/// (Unparsed) Source Code. Source Code is processed into [Module]s by the
/// [AssetContext]. All [Source]s have content and an identifier.
#[turbo_tasks::value_trait]
pub trait Source: Asset {
    /// The identifier of the [Source]. It's expected to be unique and capture
    /// all properties of the [Source].
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent>;
}

#[turbo_tasks::value(transparent)]
pub struct OptionSource(Option<ResolvedVc<Box<dyn Source>>>);

#[turbo_tasks::value(transparent)]
pub struct Sources(Vec<ResolvedVc<Box<dyn Source>>>);
