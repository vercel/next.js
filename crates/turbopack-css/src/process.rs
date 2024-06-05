use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use anyhow::{bail, Context, Result};
use indexmap::IndexMap;
use lightningcss::{
    css_modules::{CssModuleExport, CssModuleExports, CssModuleReference, Pattern, Segment},
    dependencies::{Dependency, ImportDependency, Location, SourceRange},
    stylesheet::{ParserOptions, PrinterOptions, StyleSheet, ToCssResult},
    targets::{Features, Targets},
    values::url::Url,
    visit_types,
    visitor::Visit,
};
use once_cell::sync::Lazy;
use regex::Regex;
use smallvec::smallvec;
use swc_core::{
    atoms::Atom,
    base::sourcemap::SourceMapBuilder,
    common::{BytePos, FileName, LineCol, Span},
    css::{
        ast::{
            ComplexSelector, ComplexSelectorChildren, CompoundSelector, ForgivingComplexSelector,
            ForgivingRelativeSelector, PseudoClassSelectorChildren, PseudoElementSelectorChildren,
            RelativeSelector, SubclassSelector, TypeSelector, UrlValue,
        },
        codegen::{writer::basic::BasicCssWriter, CodeGenerator},
        modules::{CssClassName, TransformConfig},
        visit::{VisitMut, VisitMutWith, VisitWith},
    },
};
use tracing::Instrument;
use turbo_tasks::{RcStr, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    issue::{
        Issue, IssueExt, IssueSource, IssueStage, OptionIssueSource, OptionStyledString,
        StyledString,
    },
    reference::ModuleReferences,
    reference_type::ImportContext,
    resolve::origin::ResolveOrigin,
    source::Source,
    source_map::{GenerateSourceMap, OptionSourceMap},
    source_pos::SourcePos,
    SOURCE_MAP_PREFIX,
};
use turbopack_swc_utils::emitter::IssueEmitter;

use crate::{
    lifetime_util::stylesheet_into_static,
    parse::InlineSourcesContentConfig,
    references::{
        analyze_references,
        url::{replace_url_references, resolve_url_reference, UrlAssetReference},
    },
    CssModuleAssetType,
};

// Capture up until the first "."
static BASENAME_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[^.]*").unwrap());

#[derive(Debug)]
pub enum StyleSheetLike<'i, 'o> {
    LightningCss(StyleSheet<'i, 'o>),
    Swc {
        stylesheet: swc_core::css::ast::Stylesheet,
        css_modules: Option<SwcCssModuleMode>,
    },
}

#[derive(Debug, Clone)]
pub struct SwcCssModuleMode {
    basename: String,
    path_hash: u32,
}

impl PartialEq for StyleSheetLike<'_, '_> {
    fn eq(&self, _: &Self) -> bool {
        false
    }
}

pub type CssOutput = (ToCssResult, Option<ParseCssResultSourceMap>);

impl<'i, 'o> StyleSheetLike<'i, 'o> {
    pub fn to_static(
        &self,
        options: ParserOptions<'static, 'static>,
    ) -> StyleSheetLike<'static, 'static> {
        match self {
            StyleSheetLike::LightningCss(ss) => {
                StyleSheetLike::LightningCss(stylesheet_into_static(ss, options))
            }
            StyleSheetLike::Swc {
                stylesheet,
                css_modules,
            } => StyleSheetLike::Swc {
                stylesheet: stylesheet.clone(),
                css_modules: css_modules.clone(),
            },
        }
    }

    pub fn to_css(
        &self,
        cm: Arc<swc_core::common::SourceMap>,
        code: &str,
        enable_srcmap: bool,
        remove_imports: bool,
        handle_nesting: bool,
    ) -> Result<CssOutput> {
        match self {
            StyleSheetLike::LightningCss(ss) => {
                let mut srcmap = if enable_srcmap {
                    Some(parcel_sourcemap::SourceMap::new(""))
                } else {
                    None
                };

                let result = ss.to_css(PrinterOptions {
                    minify: false,
                    source_map: srcmap.as_mut(),
                    targets: if handle_nesting {
                        Targets {
                            include: Features::Nesting,
                            ..Default::default()
                        }
                    } else {
                        Default::default()
                    },
                    analyze_dependencies: None,
                    ..Default::default()
                })?;

                if let Some(srcmap) = &mut srcmap {
                    debug_assert_eq!(ss.sources.len(), 1);

                    srcmap.add_sources(ss.sources.clone());
                    srcmap.set_source_content(0, code)?;
                }

                Ok((
                    result,
                    srcmap.map(ParseCssResultSourceMap::new_lightningcss),
                ))
            }
            StyleSheetLike::Swc {
                stylesheet,
                css_modules,
            } => {
                let mut stylesheet = stylesheet.clone();
                // We always analyze dependencies, but remove them only if remove_imports is
                // true
                let mut deps = vec![];
                stylesheet.visit_mut_with(&mut SwcDepColllector {
                    deps: &mut deps,
                    remove_imports,
                });

                // lightningcss specifies css module mode in the parser options.
                let mut css_module_exports = None;
                if let Some(SwcCssModuleMode {
                    basename,
                    path_hash,
                }) = css_modules
                {
                    let output = swc_core::css::modules::compile(
                        &mut stylesheet,
                        ModuleTransformConfig {
                            suffix: format!("__{}__{:x}", basename, path_hash),
                        },
                    );

                    let mut map = CssModuleExports::default();

                    for (class_name, export_class_names) in output.renamed {
                        for export_class_name in export_class_names {
                            // If the class name is already in the map, the first
                            // one is the reference to itself and the current one is
                            // the reference to the other class.
                            match export_class_name {
                                CssClassName::Local { name } => {
                                    map.entry(class_name.to_string())
                                        .and_modify(|e| {
                                            e.composes.push(CssModuleReference::Local {
                                                name: name.value.to_string(),
                                            })
                                        })
                                        .or_insert_with(|| CssModuleExport {
                                            name: name.value.to_string(),
                                            composes: Vec::new(),
                                            is_referenced: true,
                                        });
                                }
                                CssClassName::Global { name } => {
                                    map.entry(class_name.to_string())
                                        .and_modify(|e| {
                                            e.composes.push(CssModuleReference::Global {
                                                name: name.value.to_string(),
                                            })
                                        })
                                        .or_insert_with(|| CssModuleExport {
                                            name: name.value.to_string(),
                                            composes: Vec::new(),
                                            is_referenced: true,
                                        });
                                }
                                CssClassName::Import { name, from } => {
                                    let e =
                                        map.entry(class_name.to_string()).or_insert_with(|| {
                                            CssModuleExport {
                                                name: name.value.to_string(),
                                                composes: Vec::new(),
                                                is_referenced: true,
                                            }
                                        });

                                    e.composes.push(CssModuleReference::Dependency {
                                        name: name.value.to_string(),
                                        specifier: from.to_string(),
                                    });
                                }
                            }
                        }
                    }

                    css_module_exports = Some(map);
                }

                if handle_nesting {
                    stylesheet.visit_mut_with(&mut swc_core::css::compat::compiler::Compiler::new(
                        swc_core::css::compat::compiler::Config {
                            process: swc_core::css::compat::feature::Features::NESTING,
                        },
                    ));
                }

                use swc_core::css::codegen::Emit;

                let mut code_string = String::new();
                let mut srcmap = if enable_srcmap { Some(vec![]) } else { None };

                let mut code_gen = CodeGenerator::new(
                    BasicCssWriter::new(&mut code_string, srcmap.as_mut(), Default::default()),
                    Default::default(),
                );

                code_gen.emit(&stylesheet)?;

                let srcmap =
                    srcmap.map(|srcmap| ParseCssResultSourceMap::new_swc(cm.clone(), srcmap));

                Ok((
                    ToCssResult {
                        code: code_string,
                        dependencies: Some(deps),
                        exports: css_module_exports,
                        references: None,
                    },
                    srcmap,
                ))
            }
        }
    }
}

/// Multiple [ModuleReference]s
#[turbo_tasks::value(transparent)]
pub struct UnresolvedUrlReferences(pub Vec<(String, Vc<UrlAssetReference>)>);

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub enum ParseCssResult {
    Ok {
        #[turbo_tasks(debug_ignore, trace_ignore)]
        cm: Arc<swc_core::common::SourceMap>,

        code: Vc<FileContent>,

        #[turbo_tasks(trace_ignore)]
        stylesheet: StyleSheetLike<'static, 'static>,

        references: Vc<ModuleReferences>,

        url_references: Vc<UnresolvedUrlReferences>,

        #[turbo_tasks(trace_ignore)]
        options: ParserOptions<'static, 'static>,
    },
    Unparseable,
    NotFound,
}

impl PartialEq for ParseCssResult {
    fn eq(&self, _: &Self) -> bool {
        false
    }
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub enum CssWithPlaceholderResult {
    Ok {
        parse_result: Vc<ParseCssResult>,

        #[turbo_tasks(debug_ignore, trace_ignore)]
        cm: Arc<swc_core::common::SourceMap>,

        references: Vc<ModuleReferences>,

        url_references: Vc<UnresolvedUrlReferences>,

        #[turbo_tasks(trace_ignore)]
        exports: Option<IndexMap<String, CssModuleExport>>,

        #[turbo_tasks(trace_ignore)]
        placeholders: HashMap<String, Url<'static>>,
    },
    Unparseable,
    NotFound,
}

impl PartialEq for CssWithPlaceholderResult {
    fn eq(&self, _: &Self) -> bool {
        false
    }
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub enum FinalCssResult {
    Ok {
        #[turbo_tasks(trace_ignore)]
        output_code: String,

        #[turbo_tasks(trace_ignore)]
        exports: Option<CssModuleExports>,

        source_map: Vc<ParseCssResultSourceMap>,
    },
    Unparseable,
    NotFound,
}

impl PartialEq for FinalCssResult {
    fn eq(&self, _: &Self) -> bool {
        false
    }
}

#[turbo_tasks::function]
pub async fn process_css_with_placeholder(
    parse_result: Vc<ParseCssResult>,
) -> Result<Vc<CssWithPlaceholderResult>> {
    let result = parse_result.await?;

    match &*result {
        ParseCssResult::Ok {
            cm,
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

            let (result, _) = stylesheet.to_css(cm.clone(), &code, false, false, false)?;

            let exports = result.exports.map(|exports| {
                let mut exports = exports.into_iter().collect::<IndexMap<_, _>>();

                exports.sort_keys();

                exports
            });

            Ok(CssWithPlaceholderResult::Ok {
                parse_result,
                cm: cm.clone(),
                exports,
                references: *references,
                url_references: *url_references,
                placeholders: HashMap::new(),
            }
            .into())
        }
        ParseCssResult::Unparseable => Ok(CssWithPlaceholderResult::Unparseable.into()),
        ParseCssResult::NotFound => Ok(CssWithPlaceholderResult::NotFound.into()),
    }
}

#[turbo_tasks::function]
pub async fn finalize_css(
    result: Vc<CssWithPlaceholderResult>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<FinalCssResult>> {
    let result = result.await?;
    match &*result {
        CssWithPlaceholderResult::Ok {
            cm,
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
                ParseCssResult::Unparseable => return Ok(FinalCssResult::Unparseable.into()),
                ParseCssResult::NotFound => return Ok(FinalCssResult::NotFound.into()),
            };

            let url_references = *url_references;

            let mut url_map = HashMap::new();

            for (src, reference) in (*url_references.await?).iter() {
                let resolved = resolve_url_reference(*reference, chunking_context).await?;
                if let Some(v) = resolved.as_ref().cloned() {
                    url_map.insert(RcStr::from(src.as_str()), v);
                }
            }

            replace_url_references(&mut stylesheet, &url_map);

            let code = code.await?;
            let code = match &*code {
                FileContent::Content(v) => v.content().to_str()?,
                _ => unreachable!("this case should be filtered out while parsing"),
            };
            let (result, srcmap) = stylesheet.to_css(cm.clone(), &code, true, true, true)?;

            Ok(FinalCssResult::Ok {
                output_code: result.code,
                exports: result.exports,
                source_map: srcmap.unwrap().cell(),
            }
            .into())
        }
        CssWithPlaceholderResult::Unparseable => Ok(FinalCssResult::Unparseable.into()),
        CssWithPlaceholderResult::NotFound => Ok(FinalCssResult::NotFound.into()),
    }
}

#[turbo_tasks::value_trait]
pub trait ParseCss {
    async fn parse_css(self: Vc<Self>) -> Result<Vc<ParseCssResult>>;
}

#[turbo_tasks::value_trait]
pub trait ProcessCss: ParseCss {
    async fn get_css_with_placeholder(self: Vc<Self>) -> Result<Vc<CssWithPlaceholderResult>>;

    async fn finalize_css(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<FinalCssResult>>;
}

#[turbo_tasks::function]
pub async fn parse_css(
    source: Vc<Box<dyn Source>>,
    origin: Vc<Box<dyn ResolveOrigin>>,
    import_context: Vc<ImportContext>,
    ty: CssModuleAssetType,
    use_swc_css: bool,
) -> Result<Vc<ParseCssResult>> {
    let span = {
        let name = source.ident().to_string().await?.to_string();
        tracing::info_span!("parse css", name = name)
    };
    async move {
        let content = source.content();
        let fs_path = source.ident().path();
        let ident_str = &*source.ident().to_string().await?;
        Ok(match &*content.await? {
            AssetContent::Redirect { .. } => ParseCssResult::Unparseable.cell(),
            AssetContent::File(file_content) => match &*file_content.await? {
                FileContent::NotFound => ParseCssResult::NotFound.cell(),
                FileContent::Content(file) => match file.content().to_str() {
                    Err(_err) => ParseCssResult::Unparseable.cell(),
                    Ok(string) => {
                        process_content(
                            *file_content,
                            string.into_owned(),
                            fs_path,
                            ident_str,
                            source,
                            origin,
                            import_context,
                            ty,
                            use_swc_css,
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
    content_vc: Vc<FileContent>,
    code: String,
    fs_path_vc: Vc<FileSystemPath>,
    filename: &str,
    source: Vc<Box<dyn Source>>,
    origin: Vc<Box<dyn ResolveOrigin>>,
    import_context: Vc<ImportContext>,
    ty: CssModuleAssetType,
    use_swc_css: bool,
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
                ..Default::default()
            }),

            _ => None,
        },
        filename: filename.to_string(),
        error_recovery: true,
        ..Default::default()
    };

    let cm: Arc<swc_core::common::SourceMap> = Default::default();

    let stylesheet = if !use_swc_css {
        StyleSheetLike::LightningCss({
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
                            err.report(source, fs_path_vc);
                        }
                    }

                    for err in warnings.read().unwrap().iter() {
                        match err.kind {
                            lightningcss::error::ParserError::UnexpectedToken(_)
                            | lightningcss::error::ParserError::UnexpectedImportRule
                            | lightningcss::error::ParserError::EndOfInput => {
                                let source = err.loc.as_ref().map(|loc| {
                                    let pos = SourcePos {
                                        line: loc.line as _,
                                        column: loc.column as _,
                                    };
                                    IssueSource::from_line_col(source, pos, pos)
                                });

                                ParsingIssue {
                                    file: fs_path_vc,
                                    msg: Vc::cell(err.to_string().into()),
                                    source: Vc::cell(source),
                                }
                                .cell()
                                .emit();
                                return Ok(ParseCssResult::Unparseable.into());
                            }

                            _ => {
                                // Ignore
                            }
                        }
                    }

                    stylesheet_into_static(&ss, without_warnings(config.clone()))
                }
                Err(e) => {
                    let source = e.loc.as_ref().map(|loc| {
                        let pos = SourcePos {
                            line: loc.line as _,
                            column: loc.column as _,
                        };
                        IssueSource::from_line_col(source, pos, pos)
                    });

                    ParsingIssue {
                        file: fs_path_vc,
                        msg: Vc::cell(e.to_string().into()),
                        source: Vc::cell(source),
                    }
                    .cell()
                    .emit();
                    return Ok(ParseCssResult::Unparseable.into());
                }
            }
        })
    } else {
        let fs_path = &*fs_path_vc.await?;

        let handler = swc_core::common::errors::Handler::with_emitter(
            true,
            false,
            Box::new(IssueEmitter::new(
                source,
                cm.clone(),
                Some("Parsing css source code failed".into()),
            )),
        );

        let fm = cm.new_source_file(FileName::Custom(filename.to_string()), code.clone());
        let mut errors = vec![];

        let ss = swc_core::css::parser::parse_file(
            &fm,
            Default::default(),
            swc_core::css::parser::parser::ParserConfig {
                css_modules: true,
                legacy_ie: true,
                legacy_nesting: true,
                ..Default::default()
            },
            &mut errors,
        );

        for err in errors {
            err.to_diagnostics(&handler).emit();
        }

        let ss: swc_core::css::ast::Stylesheet = match ss {
            Ok(v) => v,
            Err(err) => {
                err.to_diagnostics(&handler).emit();
                return Ok(ParseCssResult::Unparseable.into());
            }
        };

        if handler.has_errors() {
            return Ok(ParseCssResult::Unparseable.into());
        }

        if matches!(ty, CssModuleAssetType::Module) {
            let mut validator = CssValidator { errors: vec![] };
            ss.visit_with(&mut validator);

            for err in validator.errors {
                err.report(source, fs_path_vc);
            }
        }

        StyleSheetLike::Swc {
            stylesheet: ss,
            css_modules: if matches!(ty, CssModuleAssetType::Module) {
                let basename = BASENAME_RE
                    .captures(fs_path.file_name())
                    .context("Must include basename preceding .")?
                    .get(0)
                    .context("Must include basename preceding .")?
                    .as_str();
                // Truncate this as u32 so it's formated as 8-character hex in the suffic below
                let path_hash = turbo_tasks_hash::hash_xxh3_hash64(filename) as u32;

                Some(SwcCssModuleMode {
                    basename: basename.to_string(),
                    path_hash,
                })
            } else {
                None
            },
        }
    };

    let config = without_warnings(config);
    let mut stylesheet = stylesheet.to_static(config.clone());

    let (references, url_references) =
        analyze_references(&mut stylesheet, source, origin, import_context)?;

    Ok(ParseCssResult::Ok {
        cm,
        code: content_vc,
        stylesheet,
        references: Vc::cell(references),
        url_references: Vc::cell(url_references),
        options: config,
    }
    .into())
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
    SwcSelectorInModuleNotPure { span: Span },
    LightningCssSelectorInModuleNotPure { selector: String },
}

impl CssError {
    fn report(self, source: Vc<Box<dyn Source>>, file: Vc<FileSystemPath>) {
        match self {
            CssError::SwcSelectorInModuleNotPure { span } => {
                ParsingIssue {
                    file,
                    msg: Vc::cell(CSS_MODULE_ERROR.into()),
                    source: Vc::cell(Some(IssueSource::from_swc_offsets(
                        source,
                        span.lo.0 as _,
                        span.hi.0 as _,
                    ))),
                }
                .cell()
                .emit();
            }
            CssError::LightningCssSelectorInModuleNotPure { selector } => {
                ParsingIssue {
                    file,
                    msg: Vc::cell(format!("{CSS_MODULE_ERROR}, (lightningcss, {selector})").into()),
                    source: Vc::cell(None),
                }
                .cell()
                .emit();
            }
        }
    }
}

const CSS_MODULE_ERROR: &str =
    "Selector is not pure (pure selectors must contain at least one local class or id)";

/// We only vist top-level selectors.
impl swc_core::css::visit::Visit for CssValidator {
    fn visit_complex_selector(&mut self, n: &ComplexSelector) {
        fn is_complex_not_pure(sel: &ComplexSelector) -> bool {
            sel.children.iter().all(|sel| match sel {
                ComplexSelectorChildren::CompoundSelector(sel) => is_compound_not_pure(sel),
                ComplexSelectorChildren::Combinator(_) => true,
            })
        }

        fn is_forgiving_selector_not_pure(sel: &ForgivingComplexSelector) -> bool {
            match sel {
                ForgivingComplexSelector::ComplexSelector(sel) => is_complex_not_pure(sel),
                ForgivingComplexSelector::ListOfComponentValues(_) => false,
            }
        }

        fn is_forgiving_relative_selector_not_pure(sel: &ForgivingRelativeSelector) -> bool {
            match sel {
                ForgivingRelativeSelector::RelativeSelector(sel) => {
                    is_relative_selector_not_pure(sel)
                }
                ForgivingRelativeSelector::ListOfComponentValues(_) => false,
            }
        }

        fn is_relative_selector_not_pure(sel: &RelativeSelector) -> bool {
            is_complex_not_pure(&sel.selector)
        }

        fn is_compound_not_pure(sel: &CompoundSelector) -> bool {
            sel.subclass_selectors.iter().all(|sel| match sel {
                SubclassSelector::Attribute { .. } => true,
                SubclassSelector::PseudoClass(cls) => {
                    cls.name.value == "not"
                        || cls.name.value == "has"
                        || if let Some(c) = &cls.children {
                            c.iter().all(|c| match c {
                                PseudoClassSelectorChildren::ComplexSelector(sel) => {
                                    is_complex_not_pure(sel)
                                }

                                PseudoClassSelectorChildren::CompoundSelector(sel) => {
                                    is_compound_not_pure(sel)
                                }

                                PseudoClassSelectorChildren::SelectorList(sels) => {
                                    sels.children.iter().all(is_complex_not_pure)
                                }
                                PseudoClassSelectorChildren::ForgivingSelectorList(sels) => {
                                    sels.children.iter().all(is_forgiving_selector_not_pure)
                                }
                                PseudoClassSelectorChildren::CompoundSelectorList(sels) => {
                                    sels.children.iter().all(is_compound_not_pure)
                                }
                                PseudoClassSelectorChildren::RelativeSelectorList(sels) => {
                                    sels.children.iter().all(is_relative_selector_not_pure)
                                }
                                PseudoClassSelectorChildren::ForgivingRelativeSelectorList(
                                    sels,
                                ) => sels
                                    .children
                                    .iter()
                                    .all(is_forgiving_relative_selector_not_pure),

                                PseudoClassSelectorChildren::Ident(_)
                                | PseudoClassSelectorChildren::Str(_)
                                | PseudoClassSelectorChildren::Delimiter(_)
                                | PseudoClassSelectorChildren::PreservedToken(_)
                                | PseudoClassSelectorChildren::AnPlusB(_) => false,
                            })
                        } else {
                            true
                        }
                }
                SubclassSelector::PseudoElement(el) => match &el.children {
                    Some(c) => c.iter().all(|c| match c {
                        PseudoElementSelectorChildren::CompoundSelector(sel) => {
                            is_compound_not_pure(sel)
                        }

                        _ => false,
                    }),
                    None => true,
                },
                _ => false,
            }) && match &sel.type_selector.as_deref() {
                Some(TypeSelector::TagName(tag)) => {
                    !matches!(&*tag.name.value.value, "html" | "body")
                }
                Some(TypeSelector::Universal(..)) => true,
                None => true,
            }
        }

        if is_complex_not_pure(n) {
            self.errors
                .push(CssError::SwcSelectorInModuleNotPure { span: n.span });
        }
    }

    fn visit_simple_block(&mut self, _: &swc_core::css::ast::SimpleBlock) {}
}

/// We only vist top-level selectors.
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
            self.errors
                .push(CssError::LightningCssSelectorInModuleNotPure {
                    selector: format!("{selector:?}"),
                });
        }

        Ok(())
    }
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub enum ParseCssResultSourceMap {
    Parcel {
        #[turbo_tasks(debug_ignore, trace_ignore)]
        source_map: parcel_sourcemap::SourceMap,
    },

    Swc {
        #[turbo_tasks(debug_ignore, trace_ignore)]
        source_map: Arc<swc_core::common::SourceMap>,

        /// The position mappings that can generate a real source map given a
        /// (SWC) SourceMap.
        #[turbo_tasks(debug_ignore, trace_ignore)]
        mappings: Vec<(BytePos, LineCol)>,
    },
}

impl PartialEq for ParseCssResultSourceMap {
    fn eq(&self, _: &Self) -> bool {
        false
    }
}

impl ParseCssResultSourceMap {
    pub fn new_lightningcss(source_map: parcel_sourcemap::SourceMap) -> Self {
        ParseCssResultSourceMap::Parcel { source_map }
    }

    pub fn new_swc(
        source_map: Arc<swc_core::common::SourceMap>,
        mappings: Vec<(BytePos, LineCol)>,
    ) -> Self {
        ParseCssResultSourceMap::Swc {
            source_map,
            mappings,
        }
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for ParseCssResultSourceMap {
    #[turbo_tasks::function]
    fn generate_source_map(&self) -> Vc<OptionSourceMap> {
        match self {
            ParseCssResultSourceMap::Parcel { source_map } => {
                let mut builder = SourceMapBuilder::new(None);

                for src in source_map.get_sources() {
                    builder.add_source(&format!("{SOURCE_MAP_PREFIX}{src}"));
                }

                for (idx, content) in source_map.get_sources_content().iter().enumerate() {
                    builder.set_source_contents(idx as _, Some(content));
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

                Vc::cell(Some(
                    turbopack_core::source_map::SourceMap::new_regular(builder.into_sourcemap())
                        .cell(),
                ))
            }
            ParseCssResultSourceMap::Swc {
                source_map,
                mappings,
            } => {
                let map = source_map.build_source_map_with_config(
                    mappings,
                    None,
                    InlineSourcesContentConfig {},
                );
                Vc::cell(Some(
                    turbopack_core::source_map::SourceMap::new_regular(map).cell(),
                ))
            }
        }
    }
}

struct SwcDepColllector<'a> {
    deps: &'a mut Vec<Dependency>,
    remove_imports: bool,
}

impl VisitMut for SwcDepColllector<'_> {
    fn visit_mut_rules(&mut self, n: &mut Vec<swc_core::css::ast::Rule>) {
        n.visit_mut_children_with(self);

        if self.remove_imports {
            n.retain(|v| match v {
                swc_core::css::ast::Rule::AtRule(v) => match &v.name {
                    swc_core::css::ast::AtRuleName::DashedIdent(_) => true,
                    swc_core::css::ast::AtRuleName::Ident(name) => name.value != "import",
                },
                _ => true,
            });
        }
    }

    fn visit_mut_at_rule_prelude(&mut self, node: &mut swc_core::css::ast::AtRulePrelude) {
        match node {
            swc_core::css::ast::AtRulePrelude::ImportPrelude(i) => {
                let src = match &*i.href {
                    swc_core::css::ast::ImportHref::Url(v) => match v.value.as_deref().unwrap() {
                        UrlValue::Str(v) => v.value.clone(),
                        UrlValue::Raw(v) => v.value.clone(),
                    },
                    swc_core::css::ast::ImportHref::Str(v) => v.value.clone(),
                };

                self.deps.push(Dependency::Import(ImportDependency {
                    url: src.to_string(),
                    placeholder: Default::default(),
                    supports: None,
                    media: None,
                    loc: SourceRange {
                        file_path: String::new(),
                        start: Location { line: 0, column: 0 },
                        end: Location { line: 0, column: 0 },
                    },
                }));
            }

            _ => {
                node.visit_mut_children_with(self);
            }
        }
    }
}

struct ModuleTransformConfig {
    suffix: String,
}

impl TransformConfig for ModuleTransformConfig {
    fn new_name_for(&self, local: &Atom) -> Atom {
        format!("{}{}", *local, self.suffix).into()
    }
}

#[turbo_tasks::value]
struct ParsingIssue {
    msg: Vc<RcStr>,
    file: Vc<FileSystemPath>,
    source: Vc<OptionIssueSource>,
}

#[turbo_tasks::value_impl]
impl Issue for ParsingIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.file
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Parse.cell()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Parsing css source code failed".into()).cell()
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        self.source
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Text(self.msg.await?.as_str().into()).cell(),
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
    use swc_core::{
        common::{FileName, FilePathMapping},
        css::{ast::Stylesheet, parser::parser::ParserConfig, visit::VisitWith},
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

    fn lint_swc(code: &str) -> Vec<CssError> {
        let cm = swc_core::common::SourceMap::new(FilePathMapping::empty());

        let fm = cm.new_source_file(FileName::Custom("test.css".to_string()), code.to_string());

        let ss: Stylesheet = swc_core::css::parser::parse_file(
            &fm,
            None,
            ParserConfig {
                css_modules: true,
                ..Default::default()
            },
            &mut vec![],
        )
        .unwrap();

        let mut validator = CssValidator { errors: Vec::new() };
        ss.visit_with(&mut validator);

        validator.errors
    }

    #[track_caller]
    fn assert_lint_success(code: &str) {
        assert_eq!(lint_lightningcss(code), vec![], "lightningcss: {code}");
        assert_eq!(lint_swc(code), vec![], "swc: {code}");
    }

    #[track_caller]
    fn assert_lint_failure(code: &str) {
        assert_ne!(lint_lightningcss(code), vec![], "lightningcss: {code}");
        assert_ne!(lint_swc(code), vec![], "swc: {code}");
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
