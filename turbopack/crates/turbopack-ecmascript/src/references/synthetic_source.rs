//! Sources of synthetic modules, which are generated for a call in a module, like
//! `require.context()`, and processed like any other module.

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, ValueToStringRef, Vc};
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    SOURCE_URL_PROTOCOL,
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    issue::IssueSource,
    source::Source,
    source_map::GenerateSourceMap,
};

/// The source of a synthetic module, with a source map that maps all of its code
/// to the call it was generated for (see [`call_site_source_map`]).
#[turbo_tasks::value]
pub struct SyntheticSource {
    ident: ResolvedVc<AssetIdent>,
    code: RcStr,
    call_site: IssueSource,
}

#[turbo_tasks::value_impl]
impl SyntheticSource {
    #[turbo_tasks::function]
    pub fn new(ident: ResolvedVc<AssetIdent>, code: RcStr, call_site: IssueSource) -> Vc<Self> {
        SyntheticSource {
            ident,
            code,
            call_site,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Source for SyntheticSource {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        *self.ident
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("synthetic module {}", self.ident.to_string().await?).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for SyntheticSource {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        AssetContent::file(FileContent::Content(File::from(self.code.clone())).cell())
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for SyntheticSource {
    #[turbo_tasks::function]
    async fn generate_source_map(&self) -> Result<Vc<FileContent>> {
        call_site_source_map(self.call_site, &self.code).await
    }
}

/// A source map for the `code` of a synthetic module that maps all of it to the
/// call it was generated for, so that an issue located in the synthetic module is
/// reported at that call instead.
pub async fn call_site_source_map(call_site: IssueSource, code: &str) -> Result<Vc<FileContent>> {
    let Some(pos) = call_site.start_pos().await? else {
        return Ok(FileContent::NotFound.cell());
    };
    let source = call_site.source();
    let content = source.content().file_content().await?;
    let FileContent::Content(file) = &*content else {
        return Ok(FileContent::NotFound.cell());
    };
    let path = source.ident().await?.path.to_string_ref().await?;

    let mut builder = swc_sourcemap::SourceMapBuilder::new(None);
    let src = builder.add_source(format!("{SOURCE_URL_PROTOCOL}///{path}").into());
    builder.set_source_contents(src, Some(file.content().to_str()?.into_owned().into()));
    for line in 0..code.lines().count() {
        builder.add_raw(line as u32, 0, pos.line, pos.column, Some(src), None, false);
    }

    let mut map = Vec::new();
    builder.into_sourcemap().to_writer(&mut map)?;
    Ok(FileContent::Content(File::from(map)).cell())
}
