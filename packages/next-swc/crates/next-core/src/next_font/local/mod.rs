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
        resolve::{
            options::{ImportMapResult, ImportMapping, ImportMappingReplacement},
            parse::Request,
            ResolveResult,
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
        local::options::FontWeight,
        util::{get_request_hash, get_request_id},
    },
};

pub mod font_fallback;
pub mod options;
pub mod request;
pub mod stylesheet;
pub mod util;

#[turbo_tasks::value(shared)]
pub(crate) struct NextFontLocalReplacer {
    project_path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl NextFontLocalReplacer {
    #[turbo_tasks::function]
    pub fn new(project_path: Vc<FileSystemPath>) -> Vc<Self> {
        Self::cell(NextFontLocalReplacer { project_path })
    }

    #[turbo_tasks::function]
    async fn import_map_result(
        &self,
        context: Vc<FileSystemPath>,
        query: String,
    ) -> Result<Vc<ImportMapResult>> {
        let request_hash = get_request_hash(&query).await?;
        let qstr = qstring::QString::from(query.as_str());
        let query_vc = Vc::cell(query);
        let options_vc = font_options_from_query_map(query_vc);
        let font_fallbacks = get_font_fallbacks(context, options_vc, request_hash);
        let properties =
            &*get_font_css_properties(options_vc, font_fallbacks, request_hash).await?;
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

        Ok(ImportMapResult::Result(ResolveResult::source(Vc::upcast(js_asset)).into()).into())
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontLocalReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: String) -> Vc<ImportMapping> {
        ImportMapping::Ignore.into()
    }

    /// Intercepts requests for `next/font/local/target.css` and returns a
    /// JavaScript object with a generated className from a referenced css
    /// module.
    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        context: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let Request::Module {
            module: _,
            path: _,
            query: query_vc,
            fragment: _,
        } = &*request.await?
        else {
            return Ok(ImportMapResult::NoEntry.into());
        };

        let this = &*self.await?;
        if can_use_next_font(this.project_path, *query_vc).await? {
            Ok(self.import_map_result(context, query_vc.await?.to_string()))
        } else {
            Ok(ImportMapResult::NoEntry.into())
        }
    }
}

#[turbo_tasks::value(shared)]
pub struct NextFontLocalCssModuleReplacer {}

#[turbo_tasks::value_impl]
impl NextFontLocalCssModuleReplacer {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        Self::cell(NextFontLocalCssModuleReplacer {})
    }

    #[turbo_tasks::function]
    async fn import_map_result(
        context: Vc<FileSystemPath>,
        query: String,
    ) -> Result<Vc<ImportMapResult>> {
        let request_hash = get_request_hash(&query).await?;
        let query_vc = Vc::cell(query);

        let options = font_options_from_query_map(query_vc);
        let css_virtual_path = context.join(format!(
            "/{}.module.css",
            get_request_id(options.font_family(), request_hash).await?
        ));
        let fallback = get_font_fallbacks(context, options, request_hash);

        let stylesheet = build_stylesheet(
            font_options_from_query_map(query_vc),
            fallback,
            get_font_css_properties(options, fallback, request_hash),
            request_hash,
        )
        .await?;

        let css_asset = VirtualSource::new(
            css_virtual_path,
            AssetContent::file(FileContent::Content(stylesheet.into()).into()),
        );

        Ok(ImportMapResult::Result(ResolveResult::source(Vc::upcast(css_asset)).into()).into())
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontLocalCssModuleReplacer {
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
        self: Vc<Self>,
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

        Ok(Self::import_map_result(
            context,
            query_vc.await?.to_string(),
        ))
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
    request_hash: u32,
) -> Result<Vc<FontCssProperties>> {
    let options = &*options_vc.await?;

    Ok(FontCssProperties::cell(FontCssProperties {
        font_family: build_font_family_string(options_vc, font_fallbacks, request_hash),
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
