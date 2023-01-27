use anyhow::{bail, Context, Result};
use indexmap::IndexMap;
use indoc::formatdoc;
use once_cell::sync::Lazy;
use turbo_tasks::primitives::{OptionStringVc, OptionU16Vc, StringVc, U32Vc};
#[allow(unused_imports, /* reason = "this is used in tests" */)]
use turbo_tasks_env::{CommandLineProcessEnvVc, ProcessEnv};
use turbo_tasks_fetch::fetch;
use turbo_tasks_fs::{FileContent, FileSystemPathVc};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    issue::IssueSeverity,
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
        let properties =
            get_font_css_properties(get_scoped_font_family(*query_vc), options).await?;
        let js_asset = VirtualAssetVc::new(
                attached_next_js_package_path(self.project_path)
                    .join(&format!("internal/font/google/{}.js", get_request_id(*query_vc).await?)),
                FileContent::Content(
                    formatdoc!(
                        r#"
                            import cssModule from "@vercel/turbopack-next/internal/font/google/cssmodule.module.css?{}";
                            export default {{
                                className: cssModule.className,
                                style: {{
                                    fontFamily: "{}",
                                    {}{}
                                }},
                                variable: cssModule.variable
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
            query: query_vc,
        } = request else {
            return Ok(ImportMapResult::NoEntry.into());
        };
        request.request();

        let options = font_options_from_query_map(*query_vc);
        let stylesheet_url = get_stylesheet_url_from_options(options);
        let scoped_font_family = get_scoped_font_family(*query_vc);
        let css_virtual_path = attached_next_js_package_path(self.project_path).join(&format!(
            "internal/font/google/{}.module.css",
            get_request_id(*query_vc).await?
        ));

        let stylesheet_res = fetch(
            stylesheet_url,
            OptionStringVc::cell(Some(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like \
                 Gecko) Chrome/104.0.0.0 Safari/537.36"
                    .to_owned(),
            )),
        )
        .await?;

        let stylesheet = match &*stylesheet_res {
            Ok(r) => Some(
                update_stylesheet(r.await?.body.to_string(), options, scoped_font_family)
                    .await?
                    .clone(),
            ),
            Err(err) => {
                // Inform the user of the failure to retreive the stylesheet, but don't
                // propagate this error. We don't want e.g. offline connections to prevent page
                // renders during development. During production builds, however, this error
                // should propagate.
                //
                // TODO(WEB-283): Use fallback in dev in this case
                // TODO(WEB-293): Fail production builds (not dev) in this case
                err.to_issue(IssueSeverity::Warning.into(), css_virtual_path)
                    .as_issue()
                    .emit();

                None
            }
        };

        let properties = get_font_css_properties(scoped_font_family, options).await?;
        let font_family = properties.font_family.await?;
        let css_asset = VirtualAssetVc::new(
            css_virtual_path,
            FileContent::Content(
                formatdoc!(
                    r#"
                        {}

                        .className {{
                            font-family: {};
                            {}{}
                        }}

                        {}
                        "#,
                    stylesheet.unwrap_or_else(|| "".to_owned()),
                    font_family,
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
                    properties
                        .variable
                        .await?
                        .as_ref()
                        .map(|v| { format!(".variable {{ {}: {}; }} ", v, *font_family) })
                        .unwrap_or_else(|| "".to_owned())
                )
                .into(),
            )
            .into(),
        );

        Ok(ImportMapResult::Result(ResolveResult::Single(css_asset.into(), vec![]).into()).into())
    }
}

#[turbo_tasks::function]
async fn update_stylesheet(
    stylesheet: StringVc,
    options: NextFontGoogleOptionsVc,
    scoped_font_family: StringVc,
) -> Result<StringVc> {
    // Update font-family definitions to the scoped name
    // TODO: Do this more resiliently, e.g. transforming an swc ast
    Ok(StringVc::cell(stylesheet.await?.replace(
        &format!("font-family: '{}';", &*options.await?.font_family),
        &format!("font-family: '{}';", &*scoped_font_family.await?),
    )))
}

#[turbo_tasks::function]
async fn get_scoped_font_family(query_vc: QueryMapVc) -> Result<StringVc> {
    let options = font_options_from_query_map(query_vc).await?;

    Ok(StringVc::cell(format!(
        "__{}_{:x?}",
        options.font_family.replace(' ', "_"),
        *get_request_hash(query_vc).await?
    )))
}

#[turbo_tasks::function]
async fn get_request_id(query_vc: QueryMapVc) -> Result<StringVc> {
    let options = font_options_from_query_map(query_vc).await?;

    Ok(StringVc::cell(format!(
        "{}_{:x?}",
        options.font_family.to_lowercase().replace(' ', "_"),
        get_request_hash(query_vc).await?,
    )))
}

#[turbo_tasks::function]
async fn get_request_hash(query_vc: QueryMapVc) -> Result<U32Vc> {
    let query = &*query_vc.await?;
    let query = query.as_ref().context("Query map must be present")?;
    let mut to_hash = vec![];
    for (k, v) in query {
        to_hash.push(k);
        to_hash.push(v);
    }

    Ok(U32Vc::cell(
        // Truncate the has to u32. These hashes are ultimately displayed as 8-character
        // hexadecimal values.
        hash_xxh3_hash64(to_hash) as u32,
    ))
}

#[turbo_tasks::function]
async fn get_stylesheet_url_from_options(options: NextFontGoogleOptionsVc) -> Result<StringVc> {
    #[allow(unused_mut, unused_assignments)] // This is used in test environments
    let mut css_url: Option<String> = None;
    #[cfg(debug_assertions)]
    {
        let env = CommandLineProcessEnvVc::new();
        if let Some(url) = &*env.read("TURBOPACK_TEST_ONLY_MOCK_SERVER").await? {
            css_url = Some(format!("{}/css2", url));
        }
    }

    let options = options.await?;
    Ok(StringVc::cell(get_stylesheet_url(
        css_url.as_deref().unwrap_or(GOOGLE_FONTS_STYLESHEET_URL),
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
    variable: OptionStringVc,
}

#[turbo_tasks::function]
async fn get_font_css_properties(
    scoped_font_family: StringVc,
    options: NextFontGoogleOptionsVc,
) -> Result<FontCssPropertiesVc> {
    let options = &*options.await?;
    let scoped_font_family = &*scoped_font_family.await?;

    let mut font_families = vec![scoped_font_family.clone()];
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
        variable: OptionStringVc::cell(options.variable.clone()),
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
