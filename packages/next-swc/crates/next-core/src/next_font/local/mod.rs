use anyhow::{bail, Context, Result};
use indoc::formatdoc;
use serde::{Deserialize, Serialize};
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::{
        tasks::Value,
        tasks_fs::{json::parse_json_with_source_context, FileContent, FileSystemPath},
    },
    turbopack::core::{
        asset::AssetContent,
        issue::StyledString,
        reference_type::ReferenceType,
        resolve::{
            options::{ImportMapResult, ImportMapping, ImportMappingReplacement},
            parse::Request,
            plugin::BeforeResolvePlugin,
            RequestKey, ResolveResult, ResolveResultItem, ResolveResultOption,
        },
        virtual_source::VirtualSource,
    },
};

use self::{
    font_fallback::get_font_fallbacks,
    options::{options_from_request, FontDescriptors, NextFontLocalOptions},
    stylesheet::build_stylesheet,
    util::build_font_family_string,
};
use super::{
    font_fallback::FontFallbacks,
    util::{can_use_next_font, FontCssProperties},
};
use crate::{
    next_app::metadata::split_extension,
    next_font::{
        local::{errors::FontError, options::FontWeight},
        util::{get_request_hash, get_request_id},
    },
};

mod errors;
pub mod font_fallback;
pub mod options;
pub mod request;
pub mod stylesheet;
pub mod util;

#[turbo_tasks::value]
pub(crate) struct NextFontLocalReplacerResolvePlugin {
    root: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl NextFontLocalReplacerResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: Vc<FileSystemPath>) -> Vc<Self> {
        NextFontLocalReplacerResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for NextFontLocalReplacerResolvePlugin {
    #[turbo_tasks::function]
    async fn before_resolve(
        self: Vc<Self>,
        lookup_path: Vc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
        request_vc: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let this = &*self.await?;
        let request = &*request_vc.await?;

        let Some(request_key) = request.request() else {
            return Ok(ResolveResultOption::none());
        };

        let Request::Module {
            module: _,
            path: _,
            query: query_vc,
            fragment: _,
        } = request
        else {
            return Ok(ResolveResultOption::none());
        };

        let context = lookup_path;
        let query = query_vc.await?.to_string();
        let request_hash = get_request_hash(&query).await?;
        let options = font_options_from_query_map(*query_vc);

        match request_key.as_str() {
            "next/font/local/target.css" => {
                if !can_use_next_font(this.root, *query_vc).await? {
                    return Ok(ResolveResultOption::none());
                }

                let query = query_vc.await?.to_string();
                let request_hash = get_request_hash(&query).await?;
                let qstr = qstring::QString::from(query.as_str());
                let query_vc = Vc::cell(query);
                let options_vc = font_options_from_query_map(query_vc);
                let font_fallbacks = get_font_fallbacks(context, options_vc);
                let properties = get_font_css_properties(options_vc, font_fallbacks).await;

                if let Err(e) = &properties {
                    for source_error in e.chain() {
                        if let Some(FontError::FontFileNotFound(font_path)) =
                            source_error.downcast_ref::<FontError>()
                        {
                            return Ok(ResolveResultOption::some(
                                ResolveResult::primary_with_key(
                                    RequestKey::new(font_path.to_string()),
                                    ResolveResultItem::Error(
                                        StyledString::Line(vec![
                                            StyledString::Text(
                                                "Font file not found: Can't resolve '".to_string(),
                                            ),
                                            StyledString::Code(font_path.to_string()),
                                            StyledString::Text("'".to_string()),
                                        ])
                                        .cell(),
                                    ),
                                )
                                .into(),
                            ));
                        }
                    }
                }

                let properties = properties?;
                let file_content = formatdoc!(
                    r#"
                    import cssModule from "@vercel/turbopack-next/internal/font/local/cssmodule.module.css?{}";
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
                        .map(|w| format!("fontWeight: {},\n", w))
                        .unwrap_or_else(|| "".to_owned()),
                    properties
                        .style
                        .await?
                        .as_ref()
                        .map(|s| format!("fontStyle: \"{}\",\n", s))
                        .unwrap_or_else(|| "".to_owned()),
                );
                let js_asset = VirtualSource::new(
                    context.join(format!(
                        "{}.js",
                        get_request_id(options_vc.font_family(), request_hash).await?
                    )),
                    AssetContent::file(FileContent::Content(file_content.into()).into()),
                );

                Ok(ResolveResultOption::some(
                    ResolveResult::source(Vc::upcast(js_asset)).into(),
                ))
            }
            "@vercel/turbopack-next/internal/font/local/cssmodule.module.css" => {
                let css_virtual_path = context.join(format!(
                    "/{}.module.css",
                    get_request_id(options.font_family(), request_hash).await?
                ));
                let fallback = get_font_fallbacks(context, options);

                let stylesheet = build_stylesheet(
                    font_options_from_query_map(*query_vc),
                    fallback,
                    get_font_css_properties(options, fallback),
                )
                .await?;

                let css_asset = VirtualSource::new(
                    css_virtual_path,
                    AssetContent::file(FileContent::Content(stylesheet.into()).into()),
                );

                Ok(ResolveResultOption::some(
                    ResolveResult::source(Vc::upcast(css_asset)).into(),
                ))
            }
            "@vercel/turbopack-next/internal/font/local/font" => {
                let NextFontLocalFontFileOptions {
                    path,
                    preload,
                    has_size_adjust: size_adjust,
                } = font_file_options_from_query_map(*query_vc).await?;

                let (filename, ext) = split_extension(&path);
                let ext = ext.with_context(|| format!("font {} needs an extension", &path))?;

                // remove dashes and dots as they might be used for the markers below.
                let mut name = filename.replace(['-', '.'], "_");
                if size_adjust {
                    name.push_str("-s")
                }
                if preload {
                    name.push_str(".p")
                }

                let font_virtual_path = context.join(format!("/{}.{}", name, ext));

                let font_file = context.join(path.clone()).read();

                let font_source =
                    VirtualSource::new(font_virtual_path, AssetContent::file(font_file));

                Ok(ResolveResultOption::some(
                    ResolveResult::source(Vc::upcast(font_source)).into(),
                ))
            }
            _ => Ok(ResolveResultOption::none()),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct NextFontLocalFontFileOptions {
    pub path: String,
    pub preload: bool,
    pub has_size_adjust: bool,
}

#[turbo_tasks::value(shared)]
pub struct NextFontLocalFontFileReplacer {
    project_path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl NextFontLocalFontFileReplacer {
    #[turbo_tasks::function]
    pub fn new(project_path: Vc<FileSystemPath>) -> Vc<Self> {
        Self::cell(NextFontLocalFontFileReplacer { project_path })
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontLocalFontFileReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: String) -> Vc<ImportMapping> {
        ImportMapping::Ignore.into()
    }

    /// Intercepts requests for the font made by the CSS
    /// asset generated by the above replacer.
    /// Mainly here to rename the asset for the manifest.
    #[turbo_tasks::function]
    async fn result(
        &self,
        context: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query: query_vc,
            fragment: _,
        } = request
        else {
            return Ok(ImportMapResult::NoEntry.into());
        };

        let NextFontLocalFontFileOptions {
            path,
            preload,
            has_size_adjust: size_adjust,
        } = font_file_options_from_query_map(*query_vc).await?;

        let (filename, ext) = split_extension(&path);
        let ext = ext.with_context(|| format!("font {} needs an extension", &path))?;

        // remove dashes and dots as they might be used for the markers below.
        let mut name = filename.replace(['-', '.'], "_");
        if size_adjust {
            name.push_str("-s")
        }
        if preload {
            name.push_str(".p")
        }

        let font_virtual_path = context.join(format!("/{}.{}", name, ext));

        let font_file = context.join(path.clone()).read();

        let font_source = VirtualSource::new(font_virtual_path, AssetContent::file(font_file));

        Ok(ImportMapResult::Result(ResolveResult::source(Vc::upcast(font_source)).into()).into())
    }
}

#[turbo_tasks::function]
async fn get_font_css_properties(
    options_vc: Vc<NextFontLocalOptions>,
    font_fallbacks: Vc<FontFallbacks>,
) -> Result<Vc<FontCssProperties>> {
    let options = &*options_vc.await?;

    Ok(FontCssProperties::cell(FontCssProperties {
        font_family: build_font_family_string(options_vc, font_fallbacks),
        weight: Vc::cell(match &options.fonts {
            FontDescriptors::Many(_) => None,
            // When the user only provided a top-level font file, include the font weight in the
            // className selector rules
            FontDescriptors::One(descriptor) => descriptor
                .weight
                .as_ref()
                // Don't include values for variable fonts. These are included in font-face
                // definitions only.
                .filter(|w| !matches!(w, FontWeight::Variable(_, _)))
                .map(|w| w.to_string()),
        }),
        style: Vc::cell(match &options.fonts {
            FontDescriptors::Many(_) => None,
            // When the user only provided a top-level font file, include the font style in the
            // className selector rules
            FontDescriptors::One(descriptor) => descriptor.style.clone(),
        }),
        variable: Vc::cell(options.variable.clone()),
    }))
}

#[turbo_tasks::function]
async fn font_options_from_query_map(query: Vc<String>) -> Result<Vc<NextFontLocalOptions>> {
    let query_map = qstring::QString::from(&**query.await?);

    if query_map.len() != 1 {
        bail!("next/font/local queries have exactly one entry");
    }

    let Some((json, _)) = query_map.into_iter().next() else {
        bail!("Expected one entry");
    };

    options_from_request(&parse_json_with_source_context(&json)?)
        .map(|o| NextFontLocalOptions::new(Value::new(o)))
}

async fn font_file_options_from_query_map(
    query: Vc<String>,
) -> Result<NextFontLocalFontFileOptions> {
    let query_map = qstring::QString::from(&**query.await?);

    if query_map.len() != 1 {
        bail!("next/font/local queries have exactly one entry");
    }

    let Some((json, _)) = query_map.into_iter().next() else {
        bail!("Expected one entry");
    };

    parse_json_with_source_context(&json)
}
