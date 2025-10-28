use std::sync::{Arc, RwLock};

use anyhow::{Result, bail};
use lightningcss::{
    css_modules::{CssModuleExport, CssModuleExports, Pattern, Segment},
    stylesheet::{MinifyOptions, ParserOptions, PrinterOptions, StyleSheet, ToCssResult},
    targets::{BrowserslistConfig, Features, Targets},
    traits::ToCss,
    values::url::Url,
    visit_types,
    visitor::Visit,
};
use rustc_hash::FxHashMap;
use smallvec::smallvec;
use swc_core::base::sourcemap::SourceMapBuilder;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath, rope::Rope};
use turbopack_core::{
    SOURCE_URL_PROTOCOL,
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, MinifyType},
    environment::Environment,
    issue::{
        Issue, IssueExt, IssueSource, IssueStage, OptionIssueSource, OptionStyledString,
        StyledString,
    },
    reference::ModuleReferences,
    reference_type::ImportContext,
    resolve::origin::ResolveOrigin,
    source::Source,
    source_map::{OptionStringifiedSourceMap, utils::add_default_ignore_list},
    source_pos::SourcePos,
};

use crate::{
    CssModuleAssetType,
    lifetime_util::stylesheet_into_static,
    references::{
        analyze_references,
        url::{UrlAssetReference, replace_url_references, resolve_url_reference},
    },
};

#[derive(Debug)]
pub struct StyleSheetLike<'i, 'o>(pub(crate) StyleSheet<'i, 'o>);

impl PartialEq for StyleSheetLike<'_, '_> {
    fn eq(&self, _: &Self) -> bool {
        false
    }
}

pub type CssOutput = (ToCssResult, Option<Rope>);

#[turbo_tasks::value(transparent)]
struct LightningCssTargets(#[turbo_tasks(trace_ignore)] pub Targets);

/// Returns the LightningCSS targets for the given browserslist query.
#[turbo_tasks::function]
async fn get_lightningcss_browser_targets(
    environment: Option<ResolvedVc<Environment>>,
    handle_nesting: bool,
) -> Result<Vc<LightningCssTargets>> {
    match environment {
        Some(environment) => {
            let browserslist_query = environment.browserslist_query().owned().await?;
            let browserslist_browsers =
                lightningcss::targets::Browsers::from_browserslist_with_config(
                    browserslist_query.split(','),
                    BrowserslistConfig {
                        ignore_unknown_versions: true,
                        ..Default::default()
                    },
                )?;

            Ok(if handle_nesting {
                Vc::cell(Targets {
                    browsers: browserslist_browsers,
                    include: Features::Nesting | Features::MediaRangeSyntax,
                    ..Default::default()
                })
            } else {
                Vc::cell(Targets {
                    browsers: browserslist_browsers,
                    include: Features::MediaRangeSyntax,
                    ..Default::default()
                })
            })
        }
        // Default when empty environment is passed.
        None => Ok(Vc::cell(Default::default())),
    }
}

impl StyleSheetLike<'_, '_> {
    pub fn to_static(
        &self,
        options: ParserOptions<'static, 'static>,
    ) -> StyleSheetLike<'static, 'static> {
        StyleSheetLike(stylesheet_into_static(&self.0, options))
    }

    pub async fn to_css(
        &self,
        code: &str,
        minify_type: MinifyType,
        enable_srcmap: bool,
        handle_nesting: bool,
        mut origin_source_map: Option<parcel_sourcemap::SourceMap>,
        environment: Option<ResolvedVc<Environment>>,
    ) -> Result<CssOutput> {
        let ss = &self.0;
        let mut srcmap = if enable_srcmap {
            Some(parcel_sourcemap::SourceMap::new(""))
        } else {
            None
        };

        let targets =
            *get_lightningcss_browser_targets(environment.as_deref().copied(), handle_nesting)
                .await?;

        let result = ss.to_css(PrinterOptions {
            minify: matches!(minify_type, MinifyType::Minify { .. }),
            source_map: srcmap.as_mut(),
            targets,
            analyze_dependencies: None,
            ..Default::default()
        })?;

        if let Some(srcmap) = &mut srcmap {
            debug_assert_eq!(ss.sources.len(), 1);

            if let Some(origin_source_map) = origin_source_map.as_mut() {
                let _ = srcmap.extends(origin_source_map);
            } else {
                srcmap.add_sources(ss.sources.clone());
                srcmap.set_source_content(0, code)?;
            }
        }

        let srcmap = match srcmap {
            Some(srcmap) => Some(generate_css_source_map(&srcmap)?),
            None => None,
        };

        Ok((result, srcmap))
    }
}

/// Multiple [ModuleReference]s
#[turbo_tasks::value(transparent)]
pub struct UnresolvedUrlReferences(pub Vec<(String, ResolvedVc<UrlAssetReference>)>);

#[turbo_tasks::value(shared, serialization = "none", eq = "manual", cell = "new")]
#[allow(clippy::large_enum_variant)] // This is a turbo-tasks value
pub enum ParseCssResult {
    Ok {
        code: ResolvedVc<FileContent>,

        #[turbo_tasks(trace_ignore)]
        stylesheet: StyleSheetLike<'static, 'static>,

        references: ResolvedVc<ModuleReferences>,

        url_references: ResolvedVc<UnresolvedUrlReferences>,

        #[turbo_tasks(trace_ignore)]
        options: ParserOptions<'static, 'static>,
    },
    Unparsable,
    NotFound,
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual", cell = "new")]
pub enum CssWithPlaceholderResult {
    Ok {
        parse_result: ResolvedVc<ParseCssResult>,

        references: ResolvedVc<ModuleReferences>,

        url_references: ResolvedVc<UnresolvedUrlReferences>,

        #[turbo_tasks(trace_ignore)]
        exports: Option<FxIndexMap<String, CssModuleExport>>,

        #[turbo_tasks(trace_ignore)]
        placeholders: FxHashMap<String, Url<'static>>,
    },
    Unparsable,
    NotFound,
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub enum FinalCssResult {
    Ok {
        #[turbo_tasks(trace_ignore)]
        output_code: String,

        #[turbo_tasks(trace_ignore)]
        exports: Option<CssModuleExports>,

        source_map: ResolvedVc<OptionStringifiedSourceMap>,
    },
    Unparsable,
    NotFound,
}

impl PartialEq for FinalCssResult {
    fn eq(&self, _: &Self) -> bool {
        false
    }
}

#[turbo_tasks::function]
pub async fn process_css_with_placeholder(
    parse_result: ResolvedVc<ParseCssResult>,
    environment: Option<ResolvedVc<Environment>>,
) -> Result<Vc<CssWithPlaceholderResult>> {
    let result = parse_result.await?;

    match &*result {
        ParseCssResult::Ok {
            stylesheet,
            references,
            url_references,
            code,
            ..
        } => {
            let code = code.await?;
            let code = match &*code {
                FileContent::Content(v) => v.content().to_str()?,
                _ => bail!("this case should be filtered out while parsing"),
            };

            // We use NoMinify because this is not a final css. We need to replace url references,
            // and we do final codegen with proper minification.
            let (result, _) = stylesheet
                .to_css(&code, MinifyType::NoMinify, false, false, None, environment)
                .await?;

            let exports = result.exports.map(|exports| {
                let mut exports = exports.into_iter().collect::<FxIndexMap<_, _>>();

                exports.sort_keys();

                exports
            });

            Ok(CssWithPlaceholderResult::Ok {
                parse_result,
                exports,
                references: *references,
                url_references: *url_references,
                placeholders: FxHashMap::default(),
            }
            .cell())
        }
        ParseCssResult::Unparsable => Ok(CssWithPlaceholderResult::Unparsable.cell()),
        ParseCssResult::NotFound => Ok(CssWithPlaceholderResult::NotFound.cell()),
    }
}

#[turbo_tasks::function]
pub async fn finalize_css(
    result: Vc<CssWithPlaceholderResult>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    minify_type: MinifyType,
    origin_source_map: Vc<OptionStringifiedSourceMap>,
    environment: Option<ResolvedVc<Environment>>,
) -> Result<Vc<FinalCssResult>> {
    let result = result.await?;
    match &*result {
        CssWithPlaceholderResult::Ok {
            parse_result,
            url_references,
            ..
        } => {
            let (mut stylesheet, code) = match &*parse_result.await? {
                ParseCssResult::Ok {
                    stylesheet,
                    options,
                    code,
                    ..
                } => (stylesheet.to_static(options.clone()), *code),
                ParseCssResult::Unparsable => return Ok(FinalCssResult::Unparsable.into()),
                ParseCssResult::NotFound => return Ok(FinalCssResult::NotFound.into()),
            };

            let url_references = *url_references;

            let mut url_map = FxHashMap::default();

            for (src, reference) in (*url_references.await?).iter() {
                let resolved = resolve_url_reference(**reference, chunking_context).await?;
                if let Some(v) = resolved.as_ref().cloned() {
                    url_map.insert(RcStr::from(src.as_str()), v);
                }
            }

            replace_url_references(&mut stylesheet, &url_map);

            let code = code.await?;
            let code = match &*code {
                FileContent::Content(v) => v.content().to_str()?,
                _ => bail!("this case should be filtered out while parsing"),
            };

            let origin_source_map = if let Some(rope) = &*origin_source_map.await? {
                Some(parcel_sourcemap::SourceMap::from_json("", &rope.to_str()?)?)
            } else {
                None
            };

            let (result, srcmap) = stylesheet
                .to_css(
                    &code,
                    minify_type,
                    true,
                    true,
                    origin_source_map,
                    environment,
                )
                .await?;

            Ok(FinalCssResult::Ok {
                output_code: result.code,
                exports: result.exports,
                source_map: ResolvedVc::cell(srcmap),
            }
            .into())
        }
        CssWithPlaceholderResult::Unparsable => Ok(FinalCssResult::Unparsable.into()),
        CssWithPlaceholderResult::NotFound => Ok(FinalCssResult::NotFound.into()),
    }
}

#[turbo_tasks::value_trait]
pub trait ParseCss {
    #[turbo_tasks::function]
    async fn parse_css(self: Vc<Self>) -> Result<Vc<ParseCssResult>>;
}

#[turbo_tasks::value_trait]
pub trait ProcessCss: ParseCss {
    #[turbo_tasks::function]
    async fn get_css_with_placeholder(self: Vc<Self>) -> Result<Vc<CssWithPlaceholderResult>>;

    #[turbo_tasks::function]
    async fn finalize_css(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        minify_type: MinifyType,
    ) -> Result<Vc<FinalCssResult>>;
}

#[turbo_tasks::function]
pub async fn parse_css(
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    import_context: Option<ResolvedVc<ImportContext>>,
    ty: CssModuleAssetType,
    environment: Option<ResolvedVc<Environment>>,
) -> Result<Vc<ParseCssResult>> {
    let span = tracing::info_span!(
        "parse css",
        name = display(source.ident().to_string().await?)
    );
    async move {
        let content = source.content();
        let ident_str = &*source.ident().to_string().await?;
        Ok(match &*content.await? {
            AssetContent::Redirect { .. } => ParseCssResult::Unparsable.cell(),
            AssetContent::File(file_content) => match &*file_content.await? {
                FileContent::NotFound => ParseCssResult::NotFound.cell(),
                FileContent::Content(file) => match file.content().to_str() {
                    Err(_err) => ParseCssResult::Unparsable.cell(),
                    Ok(string) => {
                        process_content(
                            *file_content,
                            string.into_owned(),
                            ident_str,
                            source,
                            origin,
                            import_context,
                            ty,
                            environment,
                        )
                        .await?
                    }
                },
            },
        })
    }
    .instrument(span)
    .await
}

async fn process_content(
    content_vc: ResolvedVc<FileContent>,
    code: String,
    filename: &str,
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    import_context: Option<ResolvedVc<ImportContext>>,
    ty: CssModuleAssetType,
    environment: Option<ResolvedVc<Environment>>,
) -> Result<Vc<ParseCssResult>> {
    #[allow(clippy::needless_lifetimes)]
    fn without_warnings<'o, 'i>(config: ParserOptions<'o, 'i>) -> ParserOptions<'o, 'static> {
        ParserOptions {
            filename: config.filename,
            css_modules: config.css_modules,
            source_index: config.source_index,
            error_recovery: config.error_recovery,
            warnings: None,
            flags: config.flags,
        }
    }

    let config = ParserOptions {
        css_modules: match ty {
            CssModuleAssetType::Module => Some(lightningcss::css_modules::Config {
                pattern: Pattern {
                    segments: smallvec![
                        Segment::Name,
                        Segment::Literal("__"),
                        Segment::Hash,
                        Segment::Literal("__"),
                        Segment::Local,
                    ],
                },
                dashed_idents: false,
                grid: false,
                container: false,
                ..Default::default()
            }),

            _ => None,
        },
        filename: filename.to_string(),
        error_recovery: true,
        ..Default::default()
    };

    let stylesheet = StyleSheetLike({
        let warnings: Arc<RwLock<_>> = Default::default();

        match StyleSheet::parse(
            &code,
            ParserOptions {
                warnings: Some(warnings.clone()),
                ..config.clone()
            },
        ) {
            Ok(mut ss) => {
                if matches!(ty, CssModuleAssetType::Module) {
                    let mut validator = CssValidator { errors: Vec::new() };
                    ss.visit(&mut validator).unwrap();

                    for err in validator.errors {
                        err.report(source);
                    }
                }

                // We need to collect here because we need to avoid holding the lock while calling
                // `.await` in the loop.
                let warnings = warnings.read().unwrap().iter().cloned().collect::<Vec<_>>();
                for err in warnings.iter() {
                    match err.kind {
                        lightningcss::error::ParserError::UnexpectedToken(_)
                        | lightningcss::error::ParserError::UnexpectedImportRule
                        | lightningcss::error::ParserError::SelectorError(..)
                        | lightningcss::error::ParserError::EndOfInput => {
                            let source = match &err.loc {
                                Some(loc) => {
                                    let pos = SourcePos {
                                        line: loc.line as _,
                                        column: (loc.column - 1) as _,
                                    };
                                    IssueSource::from_line_col(source, pos, pos)
                                }
                                None => IssueSource::from_source_only(source),
                            };

                            ParsingIssue {
                                msg: err.kind.to_string().into(),
                                stage: IssueStage::Parse,
                                source,
                            }
                            .resolved_cell()
                            .emit();
                            return Ok(ParseCssResult::Unparsable.cell());
                        }

                        _ => {
                            // Ignore
                        }
                    }
                }

                let targets =
                    *get_lightningcss_browser_targets(environment.as_deref().copied(), true)
                        .await?;

                // minify() is actually transform, and it performs operations like CSS modules
                // handling.
                //
                // See: https://github.com/parcel-bundler/lightningcss/issues/935#issuecomment-2739325537
                if let Err(e) = ss.minify(MinifyOptions {
                    targets,
                    ..Default::default()
                }) {
                    let source = match &e.loc {
                        Some(loc) => {
                            let pos = SourcePos {
                                line: loc.line as _,
                                column: (loc.column - 1) as _,
                            };
                            IssueSource::from_line_col(source, pos, pos)
                        }
                        None => IssueSource::from_source_only(source),
                    };
                    ParsingIssue {
                        msg: e.kind.to_string().into(),
                        stage: IssueStage::Transform,
                        source,
                    }
                    .resolved_cell()
                    .emit();
                    return Ok(ParseCssResult::Unparsable.cell());
                }

                stylesheet_into_static(&ss, without_warnings(config.clone()))
            }
            Err(e) => {
                let source = match &e.loc {
                    Some(loc) => {
                        let pos = SourcePos {
                            line: loc.line as _,
                            column: (loc.column - 1) as _,
                        };
                        IssueSource::from_line_col(source, pos, pos)
                    }
                    None => IssueSource::from_source_only(source),
                };
                ParsingIssue {
                    msg: e.kind.to_string().into(),
                    stage: IssueStage::Parse,
                    source,
                }
                .resolved_cell()
                .emit();
                return Ok(ParseCssResult::Unparsable.cell());
            }
        }
    });

    let config = without_warnings(config);
    let mut stylesheet = stylesheet.to_static(config.clone());

    let (references, url_references) =
        analyze_references(&mut stylesheet, source, origin, import_context).await?;

    Ok(ParseCssResult::Ok {
        code: content_vc,
        stylesheet,
        references: ResolvedVc::cell(references),
        url_references: ResolvedVc::cell(url_references),
        options: config,
    }
    .cell())
}

/// Visitor that lints wrong css module usage.
///
/// ```css
/// button {
/// }
/// ```
///
/// is wrong for a css module because it doesn't have a class name.
struct CssValidator {
    errors: Vec<CssError>,
}

#[derive(Debug, PartialEq, Eq)]
enum CssError {
    CssSelectorInModuleNotPure { selector: String },
}

impl CssError {
    fn report(self, source: ResolvedVc<Box<dyn Source>>) {
        match self {
            CssError::CssSelectorInModuleNotPure { selector } => {
                ParsingIssue {
                    msg: format!(
                        "Selector \"{selector}\" is not pure. Pure selectors must contain at \
                         least one local class or id."
                    )
                    .into(),
                    stage: IssueStage::Transform,
                    // TODO: This should include the location of the selector in the file.
                    source: IssueSource::from_source_only(source),
                }
                .resolved_cell()
                .emit();
            }
        }
    }
}

/// We only visit top-level selectors.
impl lightningcss::visitor::Visitor<'_> for CssValidator {
    type Error = ();

    fn visit_types(&self) -> lightningcss::visitor::VisitTypes {
        visit_types!(SELECTORS)
    }

    fn visit_selector(
        &mut self,
        selector: &mut lightningcss::selector::Selector<'_>,
    ) -> Result<(), Self::Error> {
        fn is_selector_problematic(sel: &lightningcss::selector::Selector) -> bool {
            sel.iter_raw_parse_order_from(0).all(is_problematic)
        }

        fn is_problematic(c: &lightningcss::selector::Component) -> bool {
            match c {
                parcel_selectors::parser::Component::ID(..)
                | parcel_selectors::parser::Component::Class(..) => false,

                parcel_selectors::parser::Component::Combinator(..)
                | parcel_selectors::parser::Component::AttributeOther(..)
                | parcel_selectors::parser::Component::AttributeInNoNamespaceExists { .. }
                | parcel_selectors::parser::Component::AttributeInNoNamespace { .. }
                | parcel_selectors::parser::Component::ExplicitUniversalType
                | parcel_selectors::parser::Component::Negation(..) => true,

                parcel_selectors::parser::Component::Where(sel) => {
                    sel.iter().all(is_selector_problematic)
                }

                parcel_selectors::parser::Component::LocalName(local) => {
                    // Allow html and body. They are not pure selectors but are allowed.
                    !matches!(&*local.name.0, "html" | "body")
                }
                _ => false,
            }
        }

        if is_selector_problematic(selector) {
            let selector_string = selector
                .to_css_string(PrinterOptions {
                    minify: false,
                    ..Default::default()
                })
                .expect("selector.to_css_string should not fail");
            self.errors.push(CssError::CssSelectorInModuleNotPure {
                selector: selector_string,
            });
        }

        Ok(())
    }
}

fn generate_css_source_map(source_map: &parcel_sourcemap::SourceMap) -> Result<Rope> {
    let mut builder = SourceMapBuilder::new(None);

    for src in source_map.get_sources() {
        builder.add_source(format!("{SOURCE_URL_PROTOCOL}///{src}").into());
    }

    for (idx, content) in source_map.get_sources_content().iter().enumerate() {
        builder.set_source_contents(idx as _, Some(content.clone().into()));
    }

    for m in source_map.get_mappings() {
        builder.add_raw(
            m.generated_line,
            m.generated_column,
            m.original.map(|v| v.original_line).unwrap_or_default(),
            m.original.map(|v| v.original_column).unwrap_or_default(),
            Some(0),
            None,
            false,
        );
    }

    let mut map = builder.into_sourcemap();
    add_default_ignore_list(&mut map);
    let mut result = vec![];
    map.to_writer(&mut result)?;
    Ok(Rope::from(result))
}

#[turbo_tasks::value]
struct ParsingIssue {
    msg: RcStr,
    stage: IssueStage,
    source: IssueSource,
}

#[turbo_tasks::value_impl]
impl Issue for ParsingIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        self.stage.clone().cell()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(match self.stage {
            IssueStage::Parse => rcstr!("Parsing CSS source code failed"),
            IssueStage::Transform => rcstr!("Transforming CSS failed"),
            _ => rcstr!("CSS processing failed"),
        })
        .cell()
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }

    #[turbo_tasks::function]
    fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Text(self.msg.clone()).resolved_cell(),
        )))
    }
}

#[cfg(test)]
mod tests {
    use lightningcss::{
        css_modules::Pattern,
        stylesheet::{ParserOptions, StyleSheet},
        visitor::Visit,
    };

    use super::{CssError, CssValidator};

    fn lint_lightningcss(code: &str) -> Vec<CssError> {
        let mut ss = StyleSheet::parse(
            code,
            ParserOptions {
                css_modules: Some(lightningcss::css_modules::Config {
                    pattern: Pattern::default(),
                    dashed_idents: false,
                    grid: false,
                    container: false,
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .unwrap();

        let mut validator = CssValidator { errors: Vec::new() };
        ss.visit(&mut validator).unwrap();

        validator.errors
    }

    #[track_caller]
    fn assert_lint_success(code: &str) {
        assert_eq!(lint_lightningcss(code), vec![], "lightningcss: {code}");
    }

    #[track_caller]
    fn assert_lint_failure(code: &str) {
        assert_ne!(lint_lightningcss(code), vec![], "lightningcss: {code}");
    }

    #[test]
    fn css_module_pure_lint() {
        assert_lint_success(
            "html {
                --foo: 1;
            }",
        );

        assert_lint_success(
            "#id {
                color: red;
            }",
        );

        assert_lint_success(
            ".class {
                color: red;
            }",
        );

        assert_lint_success(
            "html.class {
                color: red;
            }",
        );

        assert_lint_success(
            ".class > * {
                color: red;
            }",
        );

        assert_lint_success(
            ".class * {
                color: red;
            }",
        );

        assert_lint_success(
            ":where(.main > *) {
                color: red;
            }",
        );

        assert_lint_success(
            ":where(.main > *, .root > *) {
                color: red;
            }",
        );
        assert_lint_success(
            ".style {
                background-image: var(--foo);
            }",
        );

        assert_lint_failure(
            "div {
                color: red;
            }",
        );

        assert_lint_failure(
            "div > span {
                color: red;
            }",
        );

        assert_lint_failure(
            "div span {
                color: red;
            }",
        );

        assert_lint_failure(
            "div[data-foo] {
                color: red;
            }",
        );

        assert_lint_failure(
            "div[data-foo=\"bar\"] {
                color: red;
            }",
        );

        assert_lint_failure(
            "div[data-foo=\"bar\"] span {
                color: red;
            }",
        );

        assert_lint_failure(
            "* {
                --foo: 1;
            }",
        );

        assert_lint_failure(
            "[data-foo] {
                --foo: 1;
            }",
        );

        assert_lint_failure(
            ":not(.class) {
                --foo: 1;
            }",
        );

        assert_lint_failure(
            ":not(div) {
                --foo: 1;
            }",
        );

        assert_lint_failure(
            ":where(div > *) {
                color: red;
            }",
        );

        assert_lint_failure(
            ":where(div) {
                color: red;
            }",
        );
    }
}
