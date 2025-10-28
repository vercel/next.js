use std::{path::Path, sync::LazyLock};

use anyhow::{Context, Result, bail};
use futures::FutureExt;
use indoc::formatdoc;
use regex::Regex;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, FxIndexMap, ResolvedVc, Vc};
use turbo_tasks_bytes::stream::SingleValue;
use turbo_tasks_env::{CommandLineProcessEnv, ProcessEnv};
use turbo_tasks_fetch::{FetchClientConfig, HttpResponseBody};
use turbo_tasks_fs::{
    DiskFileSystem, File, FileContent, FileSystem, FileSystemPath,
    json::parse_json_with_source_context,
};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack::evaluate_context::node_evaluate_asset_context;
use turbopack_core::{
    asset::AssetContent,
    context::AssetContext,
    ident::Layer,
    issue::{IssueExt, IssueSeverity, StyledString},
    reference_type::{InnerAssets, ReferenceType},
    resolve::{
        ResolveResult,
        options::{ImportMapResult, ImportMappingReplacement, ReplacedImportMapping},
        parse::Request,
        pattern::Pattern,
    },
    virtual_source::VirtualSource,
};
use turbopack_node::{
    debug::should_debug, evaluate::evaluate, execution_context::ExecutionContext,
};

use self::{
    font_fallback::get_font_fallback,
    options::{FontDataEntry, FontWeights, NextFontGoogleOptions, options_from_request},
    stylesheet::build_stylesheet,
    util::{get_font_axes, get_stylesheet_url},
};
use super::{
    font_fallback::FontFallback,
    util::{
        FontCssProperties, FontFamilyType, can_use_next_font, get_request_hash, get_request_id,
        get_scoped_font_family,
    },
};
use crate::{
    embed_js::next_js_file_path, mode::NextMode, next_app::metadata::split_extension,
    next_font::issue::NextFontIssue, util::load_next_js_templateon,
};

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

/// The google fonts plugin downloads fonts locally and transforms the url in the css into a
/// specific format that is then intercepted later. This is the prefix we use for the new url.
pub const GOOGLE_FONTS_INTERNAL_PREFIX: &str = "@vercel/turbopack-next/internal/font/google/font";

#[turbo_tasks::value(transparent)]
struct FontData(FxIndexMap<RcStr, FontDataEntry>);

#[turbo_tasks::value(shared)]
pub(crate) struct NextFontGoogleReplacer {
    project_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl NextFontGoogleReplacer {
    #[turbo_tasks::function]
    pub fn new(project_path: FileSystemPath) -> Vc<Self> {
        Self::cell(NextFontGoogleReplacer { project_path })
    }

    #[turbo_tasks::function]
    async fn import_map_result(&self, query: RcStr) -> Result<Vc<ImportMapResult>> {
        let request_hash = get_request_hash(&query);
        let qstr = qstring::QString::from(query.as_str());

        let font_data = load_font_data(self.project_path.clone());
        let options = font_options_from_query_map(query, font_data);

        let fallback = get_font_fallback(self.project_path.clone(), options);
        let properties = get_font_css_properties(options, fallback).await?;
        let js_asset = VirtualSource::new(
            next_js_file_path(rcstr!("internal/font/google"))
                .await?
                .join(&format!("{}.js", get_request_id(options.font_family().await?, request_hash)))?,
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
                    qstr,
                    properties.font_family.await?,
                    properties
                        .weight
                        .await?
                        .as_ref()
                        .map(|w| format!("fontWeight: {w},\n"))
                        .unwrap_or_else(|| "".to_owned()),
                    properties
                        .style
                        .await?
                        .as_ref()
                        .map(|s| format!("fontStyle: \"{s}\",\n"))
                        .unwrap_or_else(|| "".to_owned()),
                )
                .into(),
            )
            .cell()),
        ).to_resolved().await?;
        Ok(ImportMapResult::Result(ResolveResult::source(ResolvedVc::upcast(js_asset))).cell())
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontGoogleReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Ignore.into()
    }

    /// Intercepts requests for `next/font/google/target.css` and returns a
    /// JavaScript object with a generated className from a referenced css
    /// module.
    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        _context: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query,
            fragment: _,
        } = request
        else {
            return Ok(ImportMapResult::NoEntry.into());
        };

        let this = &*self.await?;
        if can_use_next_font(this.project_path.clone(), query).await? {
            Ok(self.import_map_result(query.clone()))
        } else {
            Ok(ImportMapResult::NoEntry.into())
        }
    }
}

#[turbo_tasks::value(shared)]
pub struct NextFontGoogleCssModuleReplacer {
    project_path: FileSystemPath,
    execution_context: ResolvedVc<ExecutionContext>,
    next_mode: ResolvedVc<NextMode>,
    fetch_client: ResolvedVc<FetchClientConfig>,
}

#[turbo_tasks::value_impl]
impl NextFontGoogleCssModuleReplacer {
    #[turbo_tasks::function]
    pub fn new(
        project_path: FileSystemPath,
        execution_context: ResolvedVc<ExecutionContext>,
        next_mode: ResolvedVc<NextMode>,
        fetch_client: ResolvedVc<FetchClientConfig>,
    ) -> Vc<Self> {
        Self::cell(NextFontGoogleCssModuleReplacer {
            project_path,
            execution_context,
            next_mode,
            fetch_client,
        })
    }

    #[turbo_tasks::function]
    async fn import_map_result(&self, query: RcStr) -> Result<Vc<ImportMapResult>> {
        let request_hash = get_request_hash(&query);
        let font_data = load_font_data(self.project_path.clone());
        let options = font_options_from_query_map(query, font_data);
        let stylesheet_url = get_stylesheet_url_from_options(options, font_data)
            .owned()
            .await?;
        let font_family = options.font_family().await?;
        let scoped_font_family =
            get_scoped_font_family(FontFamilyType::WebFont, font_family.clone());
        let css_virtual_path = next_js_file_path(rcstr!("internal/font/google"))
            .await?
            .join(&format!(
                "/{}.module.css",
                get_request_id(font_family, request_hash)
            ))?;

        // When running Next.js integration tests, use the mock data available in
        // process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES instead of making real
        // requests to Google Fonts.
        let env = Vc::upcast::<Box<dyn ProcessEnv>>(CommandLineProcessEnv::new());
        let mocked_responses_path = &*env
            .read(rcstr!("NEXT_FONT_GOOGLE_MOCKED_RESPONSES"))
            .await?;

        let stylesheet_str = mocked_responses_path
            .as_ref()
            .map_or_else(
                || {
                    fetch_real_stylesheet(
                        *self.fetch_client,
                        stylesheet_url.clone(),
                        css_virtual_path.clone(),
                    )
                    .boxed()
                },
                |p| get_mock_stylesheet(stylesheet_url.clone(), p, *self.execution_context).boxed(),
            )
            .await?;

        let font_fallback = get_font_fallback(self.project_path.clone(), options);
        let stylesheet = match stylesheet_str {
            Some(s) => Some(
                update_google_stylesheet(
                    s,
                    options,
                    scoped_font_family,
                    font_fallback.has_size_adjust(),
                )
                .owned()
                .await?,
            ),
            None => {
                match *self.next_mode.await? {
                    // If we're in production mode, we want to fail the build to ensure proper font
                    // rendering.
                    NextMode::Build => {
                        NextFontIssue {
                            path: css_virtual_path.clone(),
                            title: StyledString::Line(vec![
                                StyledString::Code(rcstr!("next/font:")),
                                StyledString::Text(rcstr!(" error:")),
                            ])
                            .resolved_cell(),
                            description: StyledString::Text(
                                format!(
                                    "Failed to fetch `{}` from Google Fonts.",
                                    options.await?.font_family
                                )
                                .into(),
                            )
                            .resolved_cell(),
                            severity: IssueSeverity::Error,
                        }
                        .resolved_cell()
                        .emit();
                    }
                    // Inform the user of the failure to retrieve the stylesheet / font, but don't
                    // propagate this error. We don't want e.g. offline connections to prevent page
                    // renders during development.
                    NextMode::Development => {
                        NextFontIssue {
                            path: css_virtual_path.clone(),
                            title: StyledString::Line(vec![
                                StyledString::Code(rcstr!("next/font:")),
                                StyledString::Text(rcstr!(" warning:")),
                            ])
                            .resolved_cell(),
                            description: StyledString::Text(
                                format!(
                                    "Failed to download `{}` from Google Fonts. Using fallback \
                                     font instead.",
                                    options.await?.font_family
                                )
                                .into(),
                            )
                            .resolved_cell(),
                            severity: IssueSeverity::Warning,
                        }
                        .resolved_cell()
                        .emit();
                    }
                }

                None
            }
        };

        let css_asset = VirtualSource::new(
            css_virtual_path,
            AssetContent::file(
                FileContent::Content(
                    build_stylesheet(
                        Vc::cell(stylesheet),
                        get_font_css_properties(options, font_fallback),
                        font_fallback,
                    )
                    .await?
                    .into(),
                )
                .cell(),
            ),
        )
        .to_resolved()
        .await?;

        Ok(ImportMapResult::Result(ResolveResult::source(ResolvedVc::upcast(css_asset))).cell())
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontGoogleCssModuleReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Ignore.into()
    }

    /// Intercepts requests for the css module made by the virtual JavaScript
    /// asset generated by the above replacer. Returns a VirtualSource of a CSS
    /// Module containing font face definitions and exporting class names for
    /// the font and an optional css variable.
    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        _context: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query,
            fragment: _,
        } = request
        else {
            return Ok(ImportMapResult::NoEntry.cell());
        };

        Ok(self.import_map_result(query.clone()))
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct NextFontGoogleFontFileOptions {
    pub url: String,
    pub preload: bool,
    pub has_size_adjust: bool,
}

#[turbo_tasks::value(shared)]
pub struct NextFontGoogleFontFileReplacer {
    project_path: FileSystemPath,
    fetch_client: ResolvedVc<FetchClientConfig>,
}

#[turbo_tasks::value_impl]
impl NextFontGoogleFontFileReplacer {
    #[turbo_tasks::function]
    pub fn new(
        project_path: FileSystemPath,
        fetch_client: ResolvedVc<FetchClientConfig>,
    ) -> Vc<Self> {
        Self::cell(NextFontGoogleFontFileReplacer {
            project_path,
            fetch_client,
        })
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontGoogleFontFileReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Ignore.cell()
    }

    /// Intercepts requests for the font made by the CSS
    /// asset generated by the above replacer.
    /// Mainly here to rename the asset for the manifest.
    #[turbo_tasks::function]
    async fn result(
        &self,
        _context: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query,
            fragment: _,
        } = request
        else {
            return Ok(ImportMapResult::NoEntry.cell());
        };

        let NextFontGoogleFontFileOptions {
            url,
            preload,
            has_size_adjust: size_adjust,
        } = font_file_options_from_query_map(query)?;

        let (filename, ext) = split_extension(&url);
        let ext = ext.with_context(|| format!("font url {} is missing an extension", &url))?;

        // remove dashes and dots as they might be used for the markers below.
        let mut name = format!("{:016x}", hash_xxh3_hash64(filename.as_bytes()));
        if size_adjust {
            name.push_str("-s")
        }
        if preload {
            name.push_str(".p")
        }

        let font_virtual_path = next_js_file_path(rcstr!("internal/font/google"))
            .await?
            .join(&format!("/{name}.{ext}"))?;

        // doesn't seem ideal to download the font into a string, but probably doesn't
        // really matter either.
        let Some(font) =
            fetch_from_google_fonts(*self.fetch_client, url.into(), font_virtual_path.clone())
                .await?
        else {
            return Ok(ImportMapResult::Result(ResolveResult::unresolvable()).cell());
        };

        let font_source = VirtualSource::new(
            font_virtual_path,
            AssetContent::file(FileContent::Content(font.await?.0.as_slice().into()).cell()),
        )
        .to_resolved()
        .await?;

        Ok(ImportMapResult::Result(ResolveResult::source(ResolvedVc::upcast(font_source))).cell())
    }
}

#[turbo_tasks::function]
async fn load_font_data(project_root: FileSystemPath) -> Result<Vc<FontData>> {
    let data: FontData = load_next_js_templateon(
        project_root,
        rcstr!("dist/compiled/@next/font/dist/google/font-data.json"),
    )
    .await?;

    Ok(data.cell())
}

/// Updates references to the unscoped font family from Google to use scoped
/// font family names.
#[turbo_tasks::function]
async fn update_google_stylesheet(
    stylesheet: Vc<RcStr>,
    options: Vc<NextFontGoogleOptions>,
    scoped_font_family: RcStr,
    has_size_adjust: Vc<bool>,
) -> Result<Vc<RcStr>> {
    let options = &*options.await?;

    // Update font-family definitions to the scoped name
    // TODO: Do this more resiliently, e.g. transforming an swc ast
    let mut stylesheet = stylesheet.await?.replace(
        &format!("font-family: '{}';", &options.font_family),
        &format!("font-family: '{scoped_font_family}';"),
    );

    let font_files = find_font_files_in_css(
        &stylesheet,
        if options.preload {
            options.subsets.as_deref().unwrap_or_default()
        } else {
            Default::default()
        },
    );

    let has_size_adjust = *has_size_adjust.await?;

    for FontFile { font_url, preload } in font_files {
        let query = NextFontGoogleFontFileOptions {
            url: font_url.clone(),
            preload,
            has_size_adjust,
        };
        let query_str = qstring::QString::from(serde_json::to_string(&query)?.as_str());

        stylesheet = stylesheet.replace(
            &font_url,
            &format!("{GOOGLE_FONTS_INTERNAL_PREFIX}?{query_str}"),
        )
    }

    Ok(Vc::cell(stylesheet.into()))
}

#[derive(Debug)]
struct FontFile {
    font_url: String,
    preload: bool,
}

// https://github.com/vercel/next.js/blob/b95e45a5112e9f65e939eac9445ef550db072ea7/packages/font/src/google/find-font-files-in-css.ts
fn find_font_files_in_css(css: &str, subsets_to_preload: &[RcStr]) -> Vec<FontFile> {
    let mut font_files: Vec<FontFile> = Vec::new();
    let mut current_subset = "";

    for line in css.lines() {
        static COMMENT_RE: LazyLock<Regex> =
            LazyLock::new(|| Regex::new(r#"/\* (.+?) \*/"#).unwrap());
        if let Some(new_subset) = COMMENT_RE.captures(line).and_then(|c| c.get(1)) {
            current_subset = new_subset.as_str();
            continue;
        }

        static FONT_URL_RE: LazyLock<Regex> =
            LazyLock::new(|| Regex::new(r#"src: url\((.+?)\)"#).unwrap());
        let Some(font_url) = FONT_URL_RE.captures(line).and_then(|c| c.get(1)) else {
            continue;
        };
        let font_url = font_url.as_str();

        if font_files.iter().any(|file| file.font_url == font_url) {
            continue;
        }

        font_files.push(FontFile {
            font_url: font_url.to_string(),
            preload: subsets_to_preload
                .iter()
                .any(|subset| subset == current_subset),
        });
    }

    font_files
}

#[turbo_tasks::function]
async fn get_stylesheet_url_from_options(
    options: Vc<NextFontGoogleOptions>,
    font_data: Vc<FontData>,
) -> Result<Vc<RcStr>> {
    #[allow(unused_mut, unused_assignments)] // This is used in test environments
    let mut css_url: Option<String> = None;
    #[cfg(debug_assertions)]
    {
        use turbo_tasks_env::{CommandLineProcessEnv, ProcessEnv};

        let env = CommandLineProcessEnv::new();
        if let Some(url) = &*env.read(rcstr!("TURBOPACK_TEST_ONLY_MOCK_SERVER")).await? {
            css_url = Some(format!("{url}/css2"));
        }
    }

    let options = options.await?;
    Ok(Vc::cell(
        get_stylesheet_url(
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
        )?
        .into(),
    ))
}

#[turbo_tasks::function]
async fn get_font_css_properties(
    options_vc: Vc<NextFontGoogleOptions>,
    font_fallback: Vc<FontFallback>,
) -> Result<Vc<FontCssProperties>> {
    let options = &*options_vc.await?;
    let scoped_font_family =
        get_scoped_font_family(FontFamilyType::WebFont, options_vc.font_family().await?);

    let mut font_families = vec![format!("'{}'", scoped_font_family.clone()).into()];
    let font_fallback = &*font_fallback.await?;
    match font_fallback {
        FontFallback::Manual(fonts) => {
            font_families.extend_from_slice(fonts);
        }
        FontFallback::Automatic(fallback) => {
            font_families.push(format!("'{}'", fallback.scoped_font_family).into());
        }
        FontFallback::Error => {}
    }

    Ok(FontCssProperties::cell(FontCssProperties {
        font_family: ResolvedVc::cell(font_families.join(", ").into()),
        weight: ResolvedVc::cell(match &options.weights {
            FontWeights::Variable => None,
            FontWeights::Fixed(weights) => {
                if weights.len() > 1 {
                    // Don't set a rule for weight if multiple are requested
                    None
                } else {
                    weights.first().map(|w| w.to_string().into())
                }
            }
        }),
        style: ResolvedVc::cell(if options.styles.len() > 1 {
            // Don't set a rule for style if multiple are requested
            None
        } else {
            options.styles.first().cloned()
        }),
        variable: ResolvedVc::cell(options.variable.clone()),
    }))
}

#[turbo_tasks::function]
async fn font_options_from_query_map(
    query: RcStr,
    font_data: Vc<FontData>,
) -> Result<Vc<NextFontGoogleOptions>> {
    let query_map = qstring::QString::from(query.as_str());

    if query_map.len() != 1 {
        bail!("next/font/google queries must have exactly one entry");
    }

    let Some((json, _)) = query_map.into_iter().next() else {
        bail!("Expected one entry");
    };

    let options =
        options_from_request(&parse_json_with_source_context(&json)?, &*font_data.await?)?;
    Ok(NextFontGoogleOptions::new(options))
}
fn font_file_options_from_query_map(query: &RcStr) -> Result<NextFontGoogleFontFileOptions> {
    let query_map = qstring::QString::from(query.as_str());

    if query_map.len() != 1 {
        bail!("next/font/google queries have exactly one entry");
    }

    let Some((json, _)) = query_map.into_iter().next() else {
        bail!("Expected one entry");
    };

    parse_json_with_source_context(&json)
}

async fn fetch_real_stylesheet(
    fetch_client: Vc<FetchClientConfig>,
    stylesheet_url: RcStr,
    css_virtual_path: FileSystemPath,
) -> Result<Option<Vc<RcStr>>> {
    let body = fetch_from_google_fonts(fetch_client, stylesheet_url, css_virtual_path).await?;

    Ok(body.map(|body| body.to_string()))
}

async fn fetch_from_google_fonts(
    fetch_client: Vc<FetchClientConfig>,
    url: RcStr,
    virtual_path: FileSystemPath,
) -> Result<Option<Vc<HttpResponseBody>>> {
    let result = fetch_client
        .fetch(url, Some(rcstr!(USER_AGENT_FOR_GOOGLE_FONTS)))
        .await?;

    Ok(match *result {
        Ok(r) => Some(*r.await?.body),
        Err(err) => {
            err.to_issue(IssueSeverity::Warning, virtual_path)
                .to_resolved()
                .await?
                .emit();

            None
        }
    })
}

async fn get_mock_stylesheet(
    stylesheet_url: RcStr,
    mocked_responses_path: &str,
    execution_context: Vc<ExecutionContext>,
) -> Result<Option<Vc<RcStr>>> {
    let response_path = Path::new(&mocked_responses_path);
    let mock_fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(
        rcstr!("mock"),
        response_path
            .parent()
            .context("Must be valid path")?
            .to_str()
            .context("Must exist")?
            .into(),
    ));

    let ExecutionContext {
        env,
        project_path: _,
        chunking_context,
    } = *execution_context.await?;
    let asset_context = node_evaluate_asset_context(
        execution_context,
        None,
        None,
        Layer::new(rcstr!("next_font")),
        false,
    );
    let loader_path = mock_fs.root().await?.join("loader.js")?;
    let loader_source = Vc::upcast(VirtualSource::new(
        loader_path.clone(),
        AssetContent::file(
            File::from(format!(
                "import data from './{}'; export default function load() {{ return data; }};",
                response_path
                    .file_name()
                    .context("Must exist")?
                    .to_string_lossy(),
            ))
            .into(),
        ),
    ));
    let mocked_response_asset = asset_context
        .process(
            loader_source,
            ReferenceType::Internal(InnerAssets::empty().to_resolved().await?),
        )
        .module();

    let root = mock_fs.root().owned().await?;
    let val = evaluate(
        mocked_response_asset,
        root,
        *env,
        loader_source,
        asset_context,
        *chunking_context,
        None,
        vec![],
        Completion::immutable(),
        should_debug("next_font::google"),
    )
    .await?;

    match &val.try_into_single().await? {
        SingleValue::Single(val) => {
            let val: FxHashMap<RcStr, Option<RcStr>> =
                parse_json_with_source_context(val.to_str()?)?;
            Ok(val
                .get(&stylesheet_url)
                .context("url not found")?
                .clone()
                .map(Vc::cell))
        }
        _ => {
            panic!("Unexpected error evaluating JS")
        }
    }
}
