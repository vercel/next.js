use std::{collections::HashMap, path::Path};

use anyhow::{bail, Context, Result};
use futures::FutureExt;
use indexmap::IndexMap;
use indoc::formatdoc;
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::{
        tasks::{Completion, Value},
        tasks_bytes::stream::SingleValue,
        tasks_env::{CommandLineProcessEnv, ProcessEnv},
        tasks_fetch::fetch,
        tasks_fs::{
            json::parse_json_with_source_context, DiskFileSystem, File, FileContent, FileSystem,
            FileSystemPath,
        },
    },
    turbopack::{
        core::{
            asset::AssetContent,
            context::AssetContext,
            ident::AssetIdent,
            issue::{IssueExt, IssueSeverity},
            reference_type::{InnerAssets, ReferenceType},
            resolve::{
                options::{ImportMapResult, ImportMapping, ImportMappingReplacement},
                parse::Request,
                ResolveResult,
            },
            virtual_source::VirtualSource,
        },
        node::{debug::should_debug, evaluate::evaluate, execution_context::ExecutionContext},
        turbopack::evaluate_context::node_evaluate_asset_context,
    },
};

use self::{
    font_fallback::get_font_fallback,
    options::{options_from_request, FontDataEntry, FontWeights, NextFontGoogleOptions},
    stylesheet::build_stylesheet,
    util::{get_font_axes, get_stylesheet_url},
};
use super::{
    font_fallback::FontFallback,
    util::{
        get_request_hash, get_request_id, get_scoped_font_family, FontCssProperties, FontFamilyType,
    },
};
use crate::{embed_js::next_js_file_path, util::load_next_js_templateon};

pub mod font_fallback;
pub mod options;
pub mod request;
pub mod stylesheet;
pub mod util;

pub const GOOGLE_FONTS_STYLESHEET_URL: &str = "https://fonts.googleapis.com/css2";
// Always sending this user agent ensures consistent results from Google Fonts.
// Google Fonts will vary responses based on user agent, e.g. only returning
// references to certain font types for certain browsers.
pub const USER_AGENT_FOR_GOOGLE_FONTS: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
                                               AppleWebKit/537.36 (KHTML, like Gecko) \
                                               Chrome/104.0.0.0 Safari/537.36";

#[turbo_tasks::value(transparent)]
struct FontData(IndexMap<String, FontDataEntry>);

#[turbo_tasks::value(shared)]
pub(crate) struct NextFontGoogleReplacer {
    project_path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl NextFontGoogleReplacer {
    #[turbo_tasks::function]
    pub fn new(project_path: Vc<FileSystemPath>) -> Vc<Self> {
        Self::cell(NextFontGoogleReplacer { project_path })
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontGoogleReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: String) -> Vc<ImportMapping> {
        ImportMapping::Ignore.into()
    }

    /// Intercepts requests for `next/font/google/target.css` and returns a
    /// JavaScript object with a generated className from a referenced css
    /// module.
    #[turbo_tasks::function]
    async fn result(
        &self,
        _context: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query: query_vc,
        } = request
        else {
            return Ok(ImportMapResult::NoEntry.into());
        };

        let font_data = load_font_data(self.project_path);
        let query = &*query_vc.await?;
        let options = font_options_from_query_map(*query_vc, font_data);
        let request_hash = get_request_hash(*query_vc);
        let fallback = get_font_fallback(self.project_path, options, request_hash);
        let properties = get_font_css_properties(options, fallback, request_hash).await?;
        let js_asset = VirtualSource::new(
            next_js_file_path("internal/font/google".to_string())
                .join(format!("{}.js", get_request_id(options.font_family(), request_hash).await?)),
            AssetContent::file(FileContent::Content(
                formatdoc!(
                    r#"
                        import cssModule from "@vercel/turbopack-next/internal/font/google/cssmodule.module.css?{}";
                        const fontData = {{
                            className: cssModule.className,
                            style: {{
                                fontFamily: "{}",
                                {}{}
                            }},
                        }};

                        if (cssModule.variable != null) {{
                            fontData.variable = cssModule.variable;
                        }}

                        export default fontData;
                    "#,
                    // Pass along whichever options we received to the css handler
                    qstring::QString::from(&**query),
                    properties.font_family.await?,
                    properties
                        .weight
                        .await?
                        .as_ref()
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
            .into()),
        );

        Ok(ImportMapResult::Result(ResolveResult::source(Vc::upcast(js_asset)).into()).into())
    }
}

#[turbo_tasks::value(shared)]
pub struct NextFontGoogleCssModuleReplacer {
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
}

#[turbo_tasks::value_impl]
impl NextFontGoogleCssModuleReplacer {
    #[turbo_tasks::function]
    pub fn new(
        project_path: Vc<FileSystemPath>,
        execution_context: Vc<ExecutionContext>,
    ) -> Vc<Self> {
        Self::cell(NextFontGoogleCssModuleReplacer {
            project_path,
            execution_context,
        })
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontGoogleCssModuleReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: String) -> Vc<ImportMapping> {
        ImportMapping::Ignore.into()
    }

    /// Intercepts requests for the css module made by the virtual JavaScript
    /// asset generated by the above replacer. Returns a VirtualSource of a CSS
    /// Module containing font face definitions and exporting class names for
    /// the font and an optional css variable.
    #[turbo_tasks::function]
    async fn result(
        &self,
        _context: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query: query_vc,
        } = request
        else {
            return Ok(ImportMapResult::NoEntry.into());
        };

        let font_data = load_font_data(self.project_path);
        let options = font_options_from_query_map(*query_vc, font_data);
        let stylesheet_url = get_stylesheet_url_from_options(options, font_data);
        let request_hash = get_request_hash(*query_vc);
        let scoped_font_family = get_scoped_font_family(
            FontFamilyType::WebFont.cell(),
            options.font_family(),
            request_hash,
        );
        let css_virtual_path = next_js_file_path("internal/font/google".to_string()).join(format!(
            "/{}.module.css",
            get_request_id(options.font_family(), request_hash).await?
        ));

        // When running Next.js integration tests, use the mock data available in
        // process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES instead of making real
        // requests to Google Fonts.
        let env = Vc::upcast::<Box<dyn ProcessEnv>>(CommandLineProcessEnv::new());
        let mocked_responses_path = &*env
            .read("NEXT_FONT_GOOGLE_MOCKED_RESPONSES".to_string())
            .await?;
        let stylesheet_str = mocked_responses_path
            .as_ref()
            .map_or_else(
                || fetch_real_stylesheet(stylesheet_url, css_virtual_path).boxed(),
                |p| get_mock_stylesheet(stylesheet_url, p, self.execution_context).boxed(),
            )
            .await?;

        let stylesheet = match stylesheet_str {
            Some(s) => Some(
                update_google_stylesheet(s, options, scoped_font_family)
                    .await?
                    .clone_value(),
            ),
            None => None,
        };

        let font_fallback = get_font_fallback(self.project_path, options, request_hash);
        let css_asset = VirtualSource::new(
            css_virtual_path,
            AssetContent::file(
                FileContent::Content(
                    build_stylesheet(
                        Vc::cell(stylesheet),
                        get_font_css_properties(options, font_fallback, request_hash),
                        font_fallback,
                    )
                    .await?
                    .into(),
                )
                .into(),
            ),
        );

        Ok(ImportMapResult::Result(ResolveResult::source(Vc::upcast(css_asset)).into()).into())
    }
}

#[turbo_tasks::function]
async fn load_font_data(project_root: Vc<FileSystemPath>) -> Result<Vc<FontData>> {
    let data: FontData = load_next_js_templateon(
        project_root,
        "dist/compiled/@next/font/dist/google/font-data.json".to_string(),
    )
    .await?;

    Ok(data.cell())
}

/// Updates references to the unscoped font family from Google to use scoped
/// font family names.
#[turbo_tasks::function]
async fn update_google_stylesheet(
    stylesheet: Vc<String>,
    options: Vc<NextFontGoogleOptions>,
    scoped_font_family: Vc<String>,
) -> Result<Vc<String>> {
    // Update font-family definitions to the scoped name
    // TODO: Do this more resiliently, e.g. transforming an swc ast
    Ok(Vc::cell(stylesheet.await?.replace(
        &format!("font-family: '{}';", &*options.await?.font_family),
        &format!("font-family: '{}';", &*scoped_font_family.await?),
    )))
}

#[turbo_tasks::function]
async fn get_stylesheet_url_from_options(
    options: Vc<NextFontGoogleOptions>,
    font_data: Vc<FontData>,
) -> Result<Vc<String>> {
    #[allow(unused_mut, unused_assignments)] // This is used in test environments
    let mut css_url: Option<String> = None;
    #[cfg(debug_assertions)]
    {
        use turbopack_binding::turbo::tasks_env::{CommandLineProcessEnv, ProcessEnv};

        let env = CommandLineProcessEnv::new();
        if let Some(url) = &*env
            .read("TURBOPACK_TEST_ONLY_MOCK_SERVER".to_string())
            .await?
        {
            css_url = Some(format!("{}/css2", url));
        }
    }

    let options = options.await?;
    Ok(Vc::cell(get_stylesheet_url(
        css_url.as_deref().unwrap_or(GOOGLE_FONTS_STYLESHEET_URL),
        &options.font_family,
        &get_font_axes(
            &*font_data.await?,
            &options.font_family,
            &options.weights,
            &options.styles,
            &options.selected_variable_axes,
        )?,
        &options.display,
    )?))
}

#[turbo_tasks::function]
async fn get_font_css_properties(
    options_vc: Vc<NextFontGoogleOptions>,
    font_fallback: Vc<FontFallback>,
    request_hash: Vc<u32>,
) -> Result<Vc<FontCssProperties>> {
    let options = &*options_vc.await?;
    let scoped_font_family = &*get_scoped_font_family(
        FontFamilyType::WebFont.cell(),
        options_vc.font_family(),
        request_hash,
    )
    .await?;

    let mut font_families = vec![format!("'{}'", scoped_font_family.clone())];
    let font_fallback = &*font_fallback.await?;
    match font_fallback {
        FontFallback::Manual(fonts) => {
            font_families.extend_from_slice(&fonts.await?);
        }
        FontFallback::Automatic(fallback) => {
            let fallback = &*fallback.await?;
            font_families.push(format!("'{}'", *fallback.scoped_font_family.await?));
        }
        FontFallback::Error => {}
    }

    Ok(FontCssProperties::cell(FontCssProperties {
        font_family: Vc::cell(font_families.join(", ")),
        weight: Vc::cell(match &options.weights {
            FontWeights::Variable => None,
            FontWeights::Fixed(weights) => {
                if weights.len() > 1 {
                    // Don't set a rule for weight if multiple are requested
                    None
                } else {
                    weights.first().map(|w| w.to_string())
                }
            }
        }),
        style: Vc::cell(if options.styles.len() > 1 {
            // Don't set a rule for style if multiple are requested
            None
        } else {
            options.styles.first().cloned()
        }),
        variable: Vc::cell(options.variable.clone()),
    }))
}

#[turbo_tasks::function]
async fn font_options_from_query_map(
    query: Vc<String>,
    font_data: Vc<FontData>,
) -> Result<Vc<NextFontGoogleOptions>> {
    let query_map = qstring::QString::from(&**query.await?);

    if query_map.len() != 1 {
        bail!("next/font/google queries must have exactly one entry");
    }

    let Some((json, _)) = query_map.into_iter().next() else {
        bail!("Expected one entry");
    };

    options_from_request(&parse_json_with_source_context(&json)?, &*font_data.await?)
        .map(|o| NextFontGoogleOptions::new(Value::new(o)))
}

async fn fetch_real_stylesheet(
    stylesheet_url: Vc<String>,
    css_virtual_path: Vc<FileSystemPath>,
) -> Result<Option<Vc<String>>> {
    let stylesheet = fetch(
        stylesheet_url,
        Vc::cell(Some(USER_AGENT_FOR_GOOGLE_FONTS.to_owned())),
    )
    .await?;

    Ok(match &*stylesheet {
        Ok(r) => Some(r.await?.body.to_string()),
        Err(err) => {
            // Inform the user of the failure to retreive the stylesheet, but don't
            // propagate this error. We don't want e.g. offline connections to prevent page
            // renders during development. During production builds, however, this error
            // should propagate.
            //
            // TODO(WEB-283): Use fallback in dev in this case
            // TODO(WEB-293): Fail production builds (not dev) in this case
            err.to_issue(IssueSeverity::Warning.into(), css_virtual_path)
                .emit();

            None
        }
    })
}

async fn get_mock_stylesheet(
    stylesheet_url: Vc<String>,
    mocked_responses_path: &str,
    execution_context: Vc<ExecutionContext>,
) -> Result<Option<Vc<String>>> {
    let response_path = Path::new(&mocked_responses_path);
    let mock_fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(
        "mock".to_string(),
        response_path
            .parent()
            .context("Must be valid path")?
            .to_str()
            .context("Must exist")?
            .to_string(),
    ));

    let ExecutionContext {
        env,
        project_path: _,
        chunking_context,
    } = *execution_context.await?;
    let context =
        node_evaluate_asset_context(execution_context, None, None, "next_font".to_string());
    let loader_path = mock_fs.root().join("loader.js".to_string());
    let mocked_response_asset = context
        .process(
            Vc::upcast(VirtualSource::new(
                loader_path,
                AssetContent::file(
                    File::from(format!(
                        "import data from './{}'; export default function load() {{ return data; \
                         }};",
                        response_path
                            .file_name()
                            .context("Must exist")?
                            .to_string_lossy(),
                    ))
                    .into(),
                ),
            )),
            Value::new(ReferenceType::Internal(InnerAssets::empty())),
        )
        .module();

    let root = mock_fs.root();
    let val = evaluate(
        mocked_response_asset,
        root,
        env,
        AssetIdent::from_path(loader_path),
        context,
        chunking_context,
        None,
        vec![],
        Completion::immutable(),
        should_debug("next_font::google"),
    )
    .await?;

    match &val.try_into_single().await? {
        SingleValue::Single(val) => {
            let val: HashMap<String, Option<String>> =
                parse_json_with_source_context(val.to_str()?)?;
            Ok(val
                .get(&*stylesheet_url.await?)
                .context("url not found")?
                .clone()
                .map(Vc::cell))
        }
        _ => {
            panic!("Unexpected error evaluating JS")
        }
    }
}
