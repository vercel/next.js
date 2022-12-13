use anyhow::{bail, Context, Result};
use indexmap::IndexMap;
use indoc::formatdoc;
use once_cell::sync::Lazy;
use turbo_tasks::primitives::{OptionStringVc, OptionU16Vc, StringVc};
use turbo_tasks_fetch::fetch;
use turbo_tasks_fs::{FileContent, FileSystemPathVc};
use turbopack_core::{
    resolve::{
        options::{
            ImportMapResult, ImportMapResultVc, ImportMapping, ImportMappingReplacement,
            ImportMappingReplacementVc, ImportMappingVc,
        },
        parse::{Request, RequestVc},
        pattern::QueryMapVc,
        ResolveResult,
    },
    virtual_asset::VirtualAssetVc,
};

use self::options::FontWeights;
use crate::{
    embed_js::attached_next_js_package_path,
    next_font_google::{
        options::FontDataEntry,
        util::{get_font_axes, get_stylesheet_url},
    },
};

pub(crate) mod options;
pub(crate) mod request;
mod util;

pub const GOOGLE_FONTS_STYLESHEET_URL: &str = "https://fonts.googleapis.com/css2";
static FONT_DATA: Lazy<FontData> =
    Lazy::new(|| serde_json::from_str(include_str!("__generated__/font-data.json")).unwrap());

type FontData = IndexMap<String, FontDataEntry>;

#[turbo_tasks::value(shared)]
pub struct NextFontGoogleReplacer {
    project_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl NextFontGoogleReplacerVc {
    #[turbo_tasks::function]
    pub fn new(project_path: FileSystemPathVc) -> Self {
        Self::cell(NextFontGoogleReplacer { project_path })
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontGoogleReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: &str) -> ImportMappingVc {
        ImportMapping::Ignore.into()
    }

    #[turbo_tasks::function]
    async fn result(&self, request: RequestVc) -> Result<ImportMapResultVc> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query: query_vc
        } = request else {
            return Ok(ImportMapResult::NoEntry.into());
        };

        let query = &*query_vc.await?;
        let options = font_options_from_query_map(*query_vc);
        let properties = get_font_css_properties(options).await?;
        let js_asset = VirtualAssetVc::new(
                attached_next_js_package_path(self.project_path)
                    .join("internal/font/google/inter.js"),
                FileContent::Content(
                    formatdoc!(
                        r#"
                            import cssModule from "@vercel/turbopack-next/internal/font/google/cssmodule.module.css?{}";
                            export default {{
                                className: cssModule.className,
                                style: {{
                                    fontFamily: "{}",
                                    {}{}
                                }}
                            }};
                        "#,
                        // Pass along whichever options we received to the css handler
                        qstring::QString::new(query.as_ref().unwrap().iter().collect()),
                        properties.font_family.await?,
                        properties
                            .weight
                            .await?
                            .map(|w| format!("fontWeight: {},\n", w))
                            .unwrap_or_else(|| "".to_owned()),
                        properties
                            .style
                            .await?
                            .as_ref()
                            .map(|s| format!("fontStyle: \"{}\",\n", s))
                            .unwrap_or_else(|| "".to_owned()),
                    )
                    .into(),
                )
                .into(),
            );

        Ok(ImportMapResult::Result(ResolveResult::Single(js_asset.into(), vec![]).into()).into())
    }
}

#[turbo_tasks::value(shared)]
pub struct NextFontGoogleCssModuleReplacer {
    project_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl NextFontGoogleCssModuleReplacerVc {
    #[turbo_tasks::function]
    pub fn new(project_path: FileSystemPathVc) -> Self {
        Self::cell(NextFontGoogleCssModuleReplacer { project_path })
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontGoogleCssModuleReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: &str) -> ImportMappingVc {
        ImportMapping::Ignore.into()
    }

    #[turbo_tasks::function]
    async fn result(&self, request: RequestVc) -> Result<ImportMapResultVc> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query,
        } = request else {
            return Ok(ImportMapResult::NoEntry.into());
        };

        let options = font_options_from_query_map(*query);
        let stylesheet_url = get_stylesheet_url_from_options(options);

        // TODO(WEB-274): Handle this failing (e.g. connection issues). This should be
        // an Issue.
        let stylesheet_res = fetch(
            stylesheet_url,
            OptionStringVc::cell(Some(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like \
                 Gecko) Chrome/104.0.0.0 Safari/537.36"
                    .to_owned(),
            )),
        )
        .await?;

        // TODO(WEB-274): Emit an issue instead
        if stylesheet_res.status >= 400 {
            bail!("Expected a successful response for Google fonts stylesheet");
        }

        let stylesheet = &*stylesheet_res.body.to_string().await?;
        let properties = get_font_css_properties(options).await?;

        let css_asset = VirtualAssetVc::new(
            attached_next_js_package_path(self.project_path)
                .join("internal/font/google/cssmodule.module.css"),
            FileContent::Content(
                formatdoc!(
                    r#"
                        {}

                        .className {{
                            font-family: {};
                            {}{}
                        }}
                        "#,
                    stylesheet,
                    properties.font_family.await?,
                    properties
                        .weight
                        .await?
                        .map(|w| format!("font-weight: {};\n", w))
                        .unwrap_or_else(|| "".to_owned()),
                    properties
                        .style
                        .await?
                        .as_ref()
                        .map(|s| format!("font-style: {};\n", s))
                        .unwrap_or_else(|| "".to_owned()),
                )
                .into(),
            )
            .into(),
        );

        Ok(ImportMapResult::Result(ResolveResult::Single(css_asset.into(), vec![]).into()).into())
    }
}

#[turbo_tasks::function]
async fn get_stylesheet_url_from_options(options: NextFontGoogleOptionsVc) -> Result<StringVc> {
    let options = options.await?;

    Ok(StringVc::cell(get_stylesheet_url(
        GOOGLE_FONTS_STYLESHEET_URL,
        &options.font_family,
        &get_font_axes(
            &FONT_DATA,
            &options.font_family,
            &options.weights,
            &options.styles,
            &options.selected_variable_axes,
        )?,
        &options.display,
    )?))
}

#[turbo_tasks::value(transparent)]
struct NextFontGoogleOptions(self::options::NextFontGoogleOptions);

#[turbo_tasks::value(transparent)]
struct FontCssProperties {
    font_family: StringVc,
    weight: OptionU16Vc,
    style: OptionStringVc,
}

#[turbo_tasks::function]
async fn get_font_css_properties(options: NextFontGoogleOptionsVc) -> Result<FontCssPropertiesVc> {
    let options = &*options.await?;

    let mut font_families = vec![options.font_family.clone()];
    if let Some(fallback) = &options.fallback {
        font_families.extend_from_slice(fallback);
    }

    Ok(FontCssPropertiesVc::cell(FontCssProperties {
        font_family: StringVc::cell(
            font_families
                .iter()
                .map(|f| format!("'{}'", f))
                .collect::<Vec<String>>()
                .join(", "),
        ),
        weight: OptionU16Vc::cell(match &options.weights {
            FontWeights::Variable => None,
            FontWeights::Fixed(weights) => weights.first().cloned(),
        }),
        style: OptionStringVc::cell(options.styles.first().cloned()),
    }))
}

#[turbo_tasks::function]
async fn font_options_from_query_map(query: QueryMapVc) -> Result<NextFontGoogleOptionsVc> {
    let query_map = &*query.await?;
    // These are invariants from the next/font swc transform. Regular errors instead
    // of Issues should be okay.
    let query_map = query_map
        .as_ref()
        .context("@next/font/google queries must exist")?;

    if query_map.len() != 1 {
        bail!("@next/font/google queries must only have one entry");
    }

    let Some((json, _)) = query_map.iter().next() else {
            bail!("Expected one entry");
        };

    self::options::options_from_request(&serde_json::from_str(json)?, &FONT_DATA)
        .map(NextFontGoogleOptionsVc::cell)
}
