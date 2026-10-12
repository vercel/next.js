use std::{
    borrow::Cow,
    convert::Infallible,
    sync::{Arc, RwLock},
};

use anyhow::{Result, bail};
use async_trait::async_trait;
use lightningcss::{
    css_modules::{CssModuleExport, Pattern, Segment},
    error::ParserError,
    rules::{
        CssRule,
        container::{ContainerCondition, ContainerName},
    },
    stylesheet::{
        MinifyOptions, ParserFlags, ParserOptions, PrinterOptions, StyleSheet, ToCssResult,
    },
    targets::{BrowserslistConfig, Features, Targets},
    traits::{Parse, ToCss},
    values::url::Url,
    visit_types,
    visitor::{Visit, VisitTypes, Visitor},
};
use rustc_hash::{FxHashMap, FxHashSet};
use smallvec::smallvec;
use swc_core::base::sourcemap::SourceMapBuilder;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    SOURCE_URL_PROTOCOL,
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, MinifyType},
    environment::Environment,
    issue::{
        AdditionalIssueSource, Issue, IssueExt, IssueSeverity, IssueSource, IssueStage,
        StyledString,
    },
    reference::ModuleReferences,
    reference_type::ImportContext,
    resolve::origin::ResolveOrigin,
    source::Source,
    source_map::{structured::StructuredSourceMap, utils::add_default_ignore_list},
    source_pos::SourcePos,
};

use crate::{
    CssModuleType, LightningCssFeatureFlags,
    lifetime_util::stylesheet_into_static,
    references::{
        analyze_references,
        url::{UrlAssetReference, replace_url_references, resolve_url_reference},
    },
};

pub type CssOutput = (ToCssResult, Option<StructuredSourceMap>);

#[turbo_tasks::value(transparent)]
struct LightningCssTargets(
    #[turbo_tasks(unsafe_ignore)]
    #[bincode(with_serde)]
    pub Targets,
);

/// Returns the LightningCSS targets for the given browserslist query.
///
/// `extra_include` / `extra_exclude` are raw `Features` bitmasks from user
/// config (`experimental.lightningCssFeatures`). They are OR-ed into (or masked
/// from) the default feature set (`Nesting | MediaRangeSyntax`).
#[turbo_tasks::function]
async fn get_lightningcss_browser_targets(
    environment: Option<ResolvedVc<Environment>>,
    handle_nesting: bool,
    feature_flags: LightningCssFeatureFlags,
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

            let mut include = Features::MediaRangeSyntax;
            if handle_nesting {
                include |= Features::Nesting;
            }
            include |= Features::from_bits_truncate(feature_flags.include);
            let exclude = Features::from_bits_truncate(feature_flags.exclude);
            include &= !exclude;

            Ok(Vc::cell(Targets {
                browsers: browserslist_browsers,
                include,
                exclude,
            }))
        }
        // Default when empty environment is passed.
        None => Ok(Vc::cell(Default::default())),
    }
}

async fn stylesheet_to_css(
    ss: &StyleSheet<'_>,
    code: &str,
    minify_type: MinifyType,
    enable_srcmap: bool,
    handle_nesting: bool,
    mut origin_source_map: Option<parcel_sourcemap::SourceMap>,
    environment: Option<ResolvedVc<Environment>>,
    feature_flags: LightningCssFeatureFlags,
) -> Result<CssOutput> {
    let mut srcmap = if enable_srcmap {
        Some(parcel_sourcemap::SourceMap::new(""))
    } else {
        None
    };

    let targets = *get_lightningcss_browser_targets(
        environment.as_deref().copied(),
        handle_nesting,
        feature_flags,
    )
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

/// Multiple [ModuleReference]s
#[turbo_tasks::value(transparent)]
pub struct UnresolvedUrlReferences(pub Vec<(String, ResolvedVc<UrlAssetReference>)>);

#[turbo_tasks::value(shared, serialization = "skip", eq = "manual", cell = "new")]
#[allow(clippy::large_enum_variant)] // This is a turbo-tasks value
pub enum ParseCssResult {
    Ok {
        code: ResolvedVc<FileContent>,
        #[turbo_tasks(unsafe_ignore)]
        stylesheet: StyleSheet<'static>,

        references: ResolvedVc<ModuleReferences>,

        url_references: ResolvedVc<UnresolvedUrlReferences>,
        #[turbo_tasks(unsafe_ignore)]
        options: ParserOptions<'static>,
    },
    Unparsable,
    NotFound,
}

#[turbo_tasks::value(shared, serialization = "skip", eq = "manual", cell = "new")]
pub enum CssWithPlaceholderResult {
    Ok {
        parse_result: ResolvedVc<ParseCssResult>,

        references: ResolvedVc<ModuleReferences>,

        url_references: ResolvedVc<UnresolvedUrlReferences>,
        #[turbo_tasks(unsafe_ignore)]
        exports: Option<FxIndexMap<String, CssModuleExport>>,
        #[turbo_tasks(unsafe_ignore)]
        placeholders: FxHashMap<String, Url<'static>>,
    },
    Unparsable,
    NotFound,
}

#[turbo_tasks::value(shared, serialization = "skip")]
#[allow(clippy::large_enum_variant)] // This is a turbo-tasks value
pub enum FinalCssResult {
    Ok {
        output_code: String,

        source_map: Option<StructuredSourceMap>,
    },
    Unparsable,
    NotFound,
}

#[turbo_tasks::function]
pub async fn process_css_with_placeholder(
    parse_result: ResolvedVc<ParseCssResult>,
    environment: Option<ResolvedVc<Environment>>,
    feature_flags: LightningCssFeatureFlags,
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
            let (result, _) = stylesheet_to_css(
                stylesheet,
                &code,
                MinifyType::NoMinify,
                false,
                false,
                None,
                environment,
                feature_flags,
            )
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
    origin_source_map: Vc<FileContent>,
    environment: Option<ResolvedVc<Environment>>,
    feature_flags: LightningCssFeatureFlags,
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
                } => (stylesheet_into_static(stylesheet, options.clone()), *code),
                ParseCssResult::Unparsable => return Ok(FinalCssResult::Unparsable.cell()),
                ParseCssResult::NotFound => return Ok(FinalCssResult::NotFound.cell()),
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

            let origin_source_map = if let Some(rope) = origin_source_map.await?.as_content() {
                Some(parcel_sourcemap::SourceMap::from_json(
                    "",
                    &rope.content().to_str()?,
                )?)
            } else {
                None
            };

            let (result, srcmap) = stylesheet_to_css(
                &stylesheet,
                &code,
                minify_type,
                true,
                true,
                origin_source_map,
                environment,
                feature_flags,
            )
            .await?;

            Ok(FinalCssResult::Ok {
                output_code: result.code,
                source_map: srcmap,
            }
            .cell())
        }
        CssWithPlaceholderResult::Unparsable => Ok(FinalCssResult::Unparsable.cell()),
        CssWithPlaceholderResult::NotFound => Ok(FinalCssResult::NotFound.cell()),
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
    ty: CssModuleType,
    environment: Option<ResolvedVc<Environment>>,
    feature_flags: LightningCssFeatureFlags,
    module_css_debuggable_idents: bool,
) -> Result<Vc<ParseCssResult>> {
    let span = tracing::info_span!(
        "parse css",
        name = display(source.ident().to_string().await?)
    );
    async move {
        let content = source.content();
        let ident_str = &*source.ident().to_string().await?;
        Ok(match &*content.await? {
            AssetContent::Redirect(..) => ParseCssResult::Unparsable.cell(),
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
                            feature_flags,
                            module_css_debuggable_idents,
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

/// Strips a leading UTF-8 byte-order mark, if present.
fn strip_bom(code: &str) -> &str {
    code.strip_prefix('\u{feff}').unwrap_or(code)
}

/// Builds the [`SourcePos`] for a lightningcss error/warning location.
///
/// Lightning CSS counts columns from the start of the string it's given.
/// Since we hand it a BOM-stripped copy, its column numbers on line 0 are one
/// character behind the same position in the original (un-stripped) source
/// that code frames are rendered from. Add that character back when the
/// original code had a BOM and the location is on its first line.
fn source_pos_for_loc(loc: &lightningcss::error::ErrorLocation, code_had_bom: bool) -> SourcePos {
    SourcePos {
        line: loc.line,
        // lightningcss::ErrorLocation is 1-based for column only
        column: if code_had_bom && loc.line == 0 {
            loc.column
        } else {
            loc.column - 1
        },
    }
}

/// Workaround for a lightningcss bug with name-only container queries such as
/// `@container sidebar { ... }` (<https://github.com/vercel/next.js/issues/98261>).
///
/// With `error_recovery` enabled, lightningcss (as of 1.0.0-alpha.72) tries to
/// parse the empty condition after the container name, records an
/// `EndOfInput` warning at the rule's `{`, and keeps an empty
/// `ContainerCondition::Unknown` instead of `None`. The CSS is valid, so the
/// warning is a false positive.
///
/// This returns the location of the `{` of every name-only `@container` rule in
/// `code`, in lightningcss's coordinates (0-based line, 1-based UTF-16 column),
/// so those warnings can be dropped. `code` must be the exact (BOM-stripped)
/// string handed to lightningcss. Remove once lightningcss is fixed.
///
/// The scan is token-based, so it may also report such a sequence that isn't an
/// at-rule (e.g. inside a custom property value). That's harmless: only an
/// `EndOfInput` warning at exactly that `{` is dropped, and lightningcss doesn't
/// emit one there.
fn name_only_container_brace_locations(code: &str) -> FxHashSet<(u32, u32)> {
    let mut input = cssparser::ParserInput::new(code);
    let mut parser = cssparser::Parser::new(&mut input);
    let mut locations = FxHashSet::default();
    collect_name_only_container_braces(&mut parser, &mut locations);
    locations
}

fn collect_name_only_container_braces<'i>(
    input: &mut cssparser::Parser<'i, '_>,
    locations: &mut FxHashSet<(u32, u32)>,
) {
    loop {
        let token = match input.next_including_whitespace_and_comments() {
            Ok(token) => token.clone(),
            Err(_) => return,
        };
        let enters_block = match token {
            cssparser::Token::AtKeyword(ref name) if name.eq_ignore_ascii_case("container") => {
                // Use lightningcss's own name parser so that exactly the names it
                // accepts (no CSS-wide keywords, `none`, `and`, `not`, `or`) qualify.
                let brace = input.try_parse(
                    |input| -> Result<_, cssparser::ParseError<'i, ParserError<'i>>> {
                        ContainerName::parse(input)?;
                        input.skip_whitespace();
                        let location = input.current_source_location();
                        match input.next()? {
                            cssparser::Token::CurlyBracketBlock => Ok(location),
                            token => {
                                let token = token.clone();
                                Err(location.new_unexpected_token_error(token))
                            }
                        }
                    },
                );
                match brace {
                    Ok(location) => {
                        locations.insert((location.line, location.column));
                        true
                    }
                    Err(_) => false,
                }
            }
            cssparser::Token::CurlyBracketBlock
            | cssparser::Token::SquareBracketBlock
            | cssparser::Token::ParenthesisBlock
            | cssparser::Token::Function(_) => true,
            _ => false,
        };
        if enters_block {
            let _ = input.parse_nested_block(|input| {
                collect_name_only_container_braces(input, locations);
                Ok::<_, cssparser::ParseError<'i, ()>>(())
            });
        }
    }
}

/// Rewrites the empty `ContainerCondition::Unknown` that lightningcss produces
/// for a name-only `@container` rule in error-recovery mode to `None`, which is
/// what it produces without error recovery. Otherwise the rule is printed with
/// stray whitespace (`@container sidebar   {`). See
/// [`name_only_container_brace_locations`].
struct NameOnlyContainerNormalizer;

impl<'i> Visitor<'i> for NameOnlyContainerNormalizer {
    type Error = Infallible;

    fn visit_types(&self) -> VisitTypes {
        visit_types!(RULES)
    }

    fn visit_rule(&mut self, rule: &mut CssRule<'i>) -> Result<(), Self::Error> {
        if let CssRule::Container(container) = rule
            && container.name.is_some()
            && let Some(ContainerCondition::Unknown(tokens)) = &container.condition
            && tokens.0.iter().all(|token| token.is_whitespace())
        {
            container.condition = None;
        }
        rule.visit_children(self)
    }
}

/// Parse a CSS stylesheet and run CSS module validation.
///
/// Does not handle parser warnings — the caller is responsible for configuring
/// the `warnings` field in `config` and processing collected warnings.
fn parse_css_stylesheet<'a>(
    code: &'a str,
    config: ParserOptions<'a>,
    ty: CssModuleType,
    source: ResolvedVc<Box<dyn Source>>,
) -> Result<StyleSheet<'a>, lightningcss::error::Error<lightningcss::error::ParserError<'a>>> {
    // Lightning CSS tokenizes a leading byte-order mark as content instead of
    // skipping it, which misaligns the parser and rejects the first token.
    let code = strip_bom(code);
    let mut ss = StyleSheet::parse(code, config)?;

    ss.visit(&mut NameOnlyContainerNormalizer)
        .unwrap_or_else(|never| match never {});

    if matches!(ty, CssModuleType::Module) {
        let mut validator = CssValidator { errors: Vec::new() };
        ss.visit(&mut validator).unwrap();

        for err in validator.errors {
            err.report(source);
        }
    }

    Ok(ss)
}

async fn process_content(
    content_vc: ResolvedVc<FileContent>,
    code: String,
    filename: &str,
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    import_context: Option<ResolvedVc<ImportContext>>,
    ty: CssModuleType,
    environment: Option<ResolvedVc<Environment>>,
    feature_flags: LightningCssFeatureFlags,
    module_css_debuggable_idents: bool,
) -> Result<Vc<ParseCssResult>> {
    #[allow(clippy::needless_lifetimes)]
    fn without_warnings<'i>(config: ParserOptions<'i>) -> ParserOptions<'static> {
        ParserOptions {
            filename: config.filename,
            css_modules: config.css_modules,
            source_index: config.source_index,
            error_recovery: config.error_recovery,
            warnings: None,
            flags: config.flags,
        }
    }

    let code_had_bom = code.starts_with('\u{feff}');

    // `@custom-media` is draft syntax and behind a parser flag.
    //
    // See: https://lightningcss.dev/transpilation.html#custom-media-queries
    let mut flags = ParserFlags::empty();
    let include_features = Features::from_bits_truncate(feature_flags.include)
        & !Features::from_bits_truncate(feature_flags.exclude);
    flags.set(
        ParserFlags::CUSTOM_MEDIA,
        include_features.contains(Features::CustomMediaQueries),
    );

    let config = ParserOptions {
        flags,
        css_modules: match ty {
            CssModuleType::Module => Some(lightningcss::css_modules::Config {
                pattern: Pattern {
                    segments: if module_css_debuggable_idents {
                        smallvec![
                            Segment::Name,
                            Segment::Literal(Cow::Borrowed("__")),
                            Segment::Hash,
                            Segment::Literal(Cow::Borrowed("__")),
                            Segment::Local,
                        ]
                    } else {
                        smallvec![
                            Segment::Hash,
                            Segment::Literal(Cow::Borrowed("_")),
                            Segment::Local,
                        ]
                    },
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

    let stylesheet = {
        let warnings: Arc<RwLock<_>> = Default::default();

        match parse_css_stylesheet(
            &code,
            ParserOptions {
                warnings: Some(warnings.clone()),
                ..config.clone()
            },
            ty,
            source,
        ) {
            Ok(mut ss) => {
                // Scoped so that the lock guard is not held across the `await` below.
                {
                    let collected_warnings = warnings.read().unwrap();
                    // See `name_only_container_brace_locations`: only computed when
                    // there's a candidate warning, which is rare.
                    let false_positive_locations = if collected_warnings
                        .iter()
                        .any(|err| matches!(err.kind, lightningcss::error::ParserError::EndOfInput))
                    {
                        name_only_container_brace_locations(strip_bom(&code))
                    } else {
                        FxHashSet::default()
                    };
                    for err in collected_warnings.iter() {
                        if matches!(err.kind, lightningcss::error::ParserError::EndOfInput)
                            && let Some(loc) = &err.loc
                            && false_positive_locations.contains(&(loc.line, loc.column))
                        {
                            continue;
                        }

                        // Unsupported pseudo-classes/elements are common in real-world CSS
                        // (vendor prefixes, custom frameworks) and do not prevent the
                        // stylesheet from being used — treat them as recoverable warnings.
                        // All other previously-ignored parser warnings are also surfaced.
                        let severity = match err.kind {
                            lightningcss::error::ParserError::SelectorError(
                                lightningcss::error::SelectorError::UnsupportedPseudoClass(_)
                                | lightningcss::error::SelectorError::UnsupportedPseudoElement(_),
                            ) => IssueSeverity::Warning,

                            lightningcss::error::ParserError::UnexpectedToken(_)
                            | lightningcss::error::ParserError::UnexpectedImportRule
                            | lightningcss::error::ParserError::SelectorError(..)
                            | lightningcss::error::ParserError::EndOfInput => IssueSeverity::Error,

                            _ => IssueSeverity::Warning,
                        };

                        let issue_source = match &err.loc {
                            Some(loc) => IssueSource::from_single_line_col(
                                source,
                                source_pos_for_loc(loc, code_had_bom),
                            ),
                            None => IssueSource::from_source_only(source),
                        };

                        ParsingIssue {
                            severity,
                            msg: err.kind.to_string().into(),
                            stage: IssueStage::Parse,
                            source: issue_source,
                        }
                        .resolved_cell()
                        .emit();
                    }
                }

                let targets = *get_lightningcss_browser_targets(
                    environment.as_deref().copied(),
                    true,
                    feature_flags,
                )
                .await?;

                // minify() is actually transform, and it performs operations like CSS modules
                // handling.
                //
                // See: https://github.com/parcel-bundler/lightningcss/issues/935#issuecomment-2739325537
                if let Err(e) = ss.minify(MinifyOptions {
                    targets,
                    ..Default::default()
                }) {
                    let issue_source = match &e.loc {
                        Some(loc) => IssueSource::from_single_line_col(
                            source,
                            source_pos_for_loc(loc, code_had_bom),
                        ),
                        None => IssueSource::from_source_only(source),
                    };
                    ParsingIssue {
                        severity: IssueSeverity::Error,
                        msg: e.kind.to_string().into(),
                        stage: IssueStage::Transform,
                        source: issue_source,
                    }
                    .resolved_cell()
                    .emit();
                    // Re-parse to get a fresh stylesheet since minify may
                    // have partially modified the original.
                    match parse_css_stylesheet(
                        &code,
                        ParserOptions {
                            warnings: None,
                            ..config.clone()
                        },
                        ty,
                        source,
                    ) {
                        Ok(fresh) => {
                            stylesheet_into_static(&fresh, without_warnings(config.clone()))
                        }
                        Err(_) => return Ok(ParseCssResult::Unparsable.cell()),
                    }
                } else {
                    stylesheet_into_static(&ss, without_warnings(config.clone()))
                }
            }
            Err(e) => {
                let issue_source = match &e.loc {
                    Some(loc) => IssueSource::from_single_line_col(
                        source,
                        source_pos_for_loc(loc, code_had_bom),
                    ),
                    None => IssueSource::from_source_only(source),
                };
                ParsingIssue {
                    severity: IssueSeverity::Error,
                    msg: e.kind.to_string().into(),
                    stage: IssueStage::Parse,
                    source: issue_source,
                }
                .resolved_cell()
                .emit();
                return Ok(ParseCssResult::Unparsable.cell());
            }
        }
    };

    let config = without_warnings(config);
    let mut stylesheet = stylesheet_into_static(&stylesheet, config.clone());

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
                    severity: IssueSeverity::Error,
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

fn generate_css_source_map(
    source_map: &parcel_sourcemap::SourceMap,
) -> Result<StructuredSourceMap> {
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
            m.original.map(|v| v.source).or(Some(0)),
            None,
            false,
        );
    }

    let mut map = builder.into_sourcemap();
    add_default_ignore_list(&mut map);
    StructuredSourceMap::from_swc_map(map)
}

#[turbo_tasks::value]
struct ParsingIssue {
    severity: IssueSeverity,
    msg: RcStr,
    stage: IssueStage,
    source: IssueSource,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ParsingIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        self.source.file_path().await
    }

    fn stage(&self) -> IssueStage {
        self.stage.clone()
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(match self.stage {
            IssueStage::Parse => rcstr!("Parsing CSS source code failed"),
            IssueStage::Transform => rcstr!("Transforming CSS failed"),
            _ => rcstr!("CSS processing failed"),
        }))
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.msg.clone())))
    }

    async fn additional_sources(&self) -> Result<Vec<AdditionalIssueSource>> {
        if let Some(additional) = self.source.to_generated_code_source().await? {
            return Ok(vec![additional]);
        }
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use lightningcss::{
        css_modules::Pattern,
        stylesheet::{ParserOptions, StyleSheet},
        visitor::Visit,
    };

    use super::{
        CssError, CssValidator, NameOnlyContainerNormalizer, name_only_container_brace_locations,
        source_pos_for_loc, strip_bom,
    };

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

    // Lightning CSS currently triggers a Miri Stacked Borrows violation in its string parser.
    #[cfg(not(miri))]
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

    // Lightning CSS currently triggers a Miri Stacked Borrows violation in its string parser.
    #[cfg(not(miri))]
    #[test]
    fn strip_bom_lets_lightningcss_parse() {
        let with_bom = "\u{feff}@layer a {}";

        assert!(StyleSheet::parse(with_bom, ParserOptions::default()).is_err());
        assert!(StyleSheet::parse(strip_bom(with_bom), ParserOptions::default()).is_ok());
        assert_eq!(strip_bom("@layer a {}"), "@layer a {}");
    }

    #[test]
    fn source_pos_for_loc_corrects_line_one_column_for_bom_files() {
        // Column reported against the BOM-stripped copy we hand to lightningcss.
        let loc = lightningcss::error::ErrorLocation {
            filename: String::new(),
            line: 0,
            column: 12,
        };

        // No BOM: the existing 1-based-to-0-based conversion is unaffected.
        assert_eq!(source_pos_for_loc(&loc, false).column, 11);

        // With a BOM: add the stripped character back so the position still
        // lines up with the original (un-stripped) source that code frames
        // are read from.
        assert_eq!(source_pos_for_loc(&loc, true).column, 12);

        // Only line 0 (the file's first line) is affected — the BOM never
        // contains a newline, so later lines are already aligned.
        let later_line = lightningcss::error::ErrorLocation {
            filename: String::new(),
            line: 1,
            column: 12,
        };
        assert_eq!(
            source_pos_for_loc(&later_line, true).column,
            source_pos_for_loc(&later_line, false).column,
        );
    }

    /// Locations of the `EndOfInput` warnings lightningcss emits for `code` when
    /// parsing with error recovery, as Turbopack does.
    fn end_of_input_warning_locations(code: &str) -> Vec<(u32, u32)> {
        let warnings: std::sync::Arc<std::sync::RwLock<Vec<_>>> = Default::default();
        StyleSheet::parse(
            code,
            ParserOptions {
                error_recovery: true,
                warnings: Some(warnings.clone()),
                ..Default::default()
            },
        )
        .unwrap();
        let warnings = warnings.read().unwrap();
        warnings
            .iter()
            .filter(|w| matches!(w.kind, lightningcss::error::ParserError::EndOfInput))
            .map(|w| {
                let loc = w.loc.as_ref().unwrap();
                (loc.line, loc.column)
            })
            .collect()
    }

    /// Asserts that every false-positive `EndOfInput` warning lightningcss emits
    /// for `code` is detected (and nothing else), and that there is at least one.
    #[track_caller]
    fn assert_name_only_false_positives(code: &str, expected: &[(u32, u32)]) {
        let mut warned = end_of_input_warning_locations(code);
        warned.sort();
        let mut detected: Vec<_> = name_only_container_brace_locations(code)
            .into_iter()
            .collect();
        detected.sort();
        assert_eq!(warned, expected, "lightningcss warnings for: {code}");
        assert_eq!(detected, expected, "detected braces for: {code}");
    }

    // Lightning CSS currently triggers a Miri Stacked Borrows violation in its string parser.
    #[cfg(not(miri))]
    #[test]
    fn name_only_container_false_positive_is_detected() {
        assert_name_only_false_positives("@container sidebar {}", &[(0, 20)]);
        assert_name_only_false_positives("@CONTAINER Sidebar{.a{color:red}}", &[(0, 19)]);
        assert_name_only_false_positives(
            "@supports (container-type: scroll-state) {\n  @container scroll-content {\n    .a { \
             max-width: 100cqw; }\n  }\n}",
            &[(1, 29)],
        );
        assert_name_only_false_positives(
            "@container /* a */ sidebar /* b */\n\n  { .a { color: red } }",
            &[(2, 3)],
        );
        assert_name_only_false_positives("@container sid\\65 bar {}", &[(0, 23)]);
        // Columns are counted in UTF-16 code units: 😀 is two of them.
        assert_name_only_false_positives(
            ".a::before { content: '😀' }\n@container 😀 {}",
            &[(1, 15)],
        );
        assert_name_only_false_positives(
            "@media screen { @layer x { .a { @container s {} } } }\n@container t {}",
            &[(0, 46), (1, 14)],
        );
        // BOM-stripped input, as handed to lightningcss.
        assert_name_only_false_positives(strip_bom("\u{feff}@container s {}"), &[(0, 14)]);
    }

    // Lightning CSS currently triggers a Miri Stacked Borrows violation in its string parser.
    #[cfg(not(miri))]
    #[test]
    fn other_container_preludes_are_not_detected() {
        for code in [
            "@container sidebar (min-width: 400px) {}",
            "@container sidebar scroll-state(scrollable: top) {}",
            "@container (min-width: 400px) {}",
            "@container {}",
            "@container sidebar other {}",
            "@container none {}",
            "@container AND {}",
            "@container not {}",
            "@container or {}",
            "@container inherit {}",
            "@container initial {}",
            "@container unset {}",
            "@container default {}",
            "@container revert {}",
            "@container revert-layer {}",
            "@media sidebar {}",
        ] {
            assert!(
                name_only_container_brace_locations(code).is_empty(),
                "unexpectedly detected: {code}"
            );
        }
    }

    // Lightning CSS currently triggers a Miri Stacked Borrows violation in its string parser.
    #[cfg(not(miri))]
    #[test]
    fn name_only_container_condition_is_normalized() {
        let code = "@container scroll-content { .a { color: red } }\n@container s (width > 1px) { \
                    .b { color: red } }";
        let mut ss = StyleSheet::parse(
            code,
            ParserOptions {
                error_recovery: true,
                ..Default::default()
            },
        )
        .unwrap();
        ss.visit(&mut NameOnlyContainerNormalizer).unwrap();
        let css = ss
            .to_css(lightningcss::stylesheet::PrinterOptions::default())
            .unwrap()
            .code;
        assert_eq!(
            css,
            "@container scroll-content {\n  .a {\n    color: red;\n  }\n}\n\n@container s (width \
             > 1px) {\n  .b {\n    color: red;\n  }\n}\n"
        );
    }
}
