use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, ResolvedVc, Vc};
use turbo_tasks_fs::FileContent;

use crate::{
    asset::{Asset, AssetContent},
    ident::{AssetIdent, is_redundant_rename},
    source::Source,
    source_map::{GenerateSourceMap, SourceMapType},
};

/// A [Source] with the content of another [Source], but with its ident renamed according to a
/// rename pattern (see [`AssetIdent::rename_as`]), so it is processed as if it had the new file
/// name. A pattern that only appends an extension the path already has keeps the original ident
/// (see [`is_redundant_rename`]).
#[turbo_tasks::value]
pub struct RenamedSource {
    source: ResolvedVc<Box<dyn Source>>,
    rename_as: RcStr,
}

#[turbo_tasks::value_impl]
impl RenamedSource {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>, rename_as: RcStr) -> Vc<Self> {
        RenamedSource { source, rename_as }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Source for RenamedSource {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let ident_vc = self.source.ident();
        let ident = ident_vc.await?;
        if is_redundant_rename(&self.rename_as, &ident.path.path) {
            return Ok(ident_vc);
        }
        Ok(ReadRef::into_owned(ident)
            .rename_as(&self.rename_as)
            .into_vc())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<RcStr>> {
        let inner = self.source.description().await?;
        Ok(Vc::cell(
            format!("{} renamed as {}", inner, self.rename_as).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for RenamedSource {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for RenamedSource {
    #[turbo_tasks::function]
    fn generate_source_map(&self, ty: SourceMapType) -> Vc<FileContent> {
        match ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(self.source) {
            Some(source) => source.generate_source_map(ty),
            None => FileContent::NotFound.cell(),
        }
    }
}
