// This crate is a vendored, lightly-modified port of the upstream
// `lightningcss-napi` crate (see README.md for provenance and LICENSE for the
// license). Allow a handful of style lints that come from the upstream source
// rather than churn the vendored code.
#![allow(
    clippy::enum_variant_names,
    clippy::from_over_into,
    clippy::needless_borrow,
    clippy::single_match,
    clippy::to_string_in_format_args
)]

use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, RwLock},
};

use at_rule_parser::{CustomAtRuleConfig, CustomAtRuleParser};
use lightningcss::{
    css_modules::{CssModuleExports, CssModuleReferences, PatternParseError},
    dependencies::{Dependency, DependencyOptions},
    error::{Error, ErrorLocation, MinifyErrorKind, ParserError, PrinterErrorKind},
    stylesheet::{
        MinifyOptions, ParserFlags, ParserOptions, PrinterOptions, PseudoClasses, StyleAttribute,
        StyleSheet,
    },
    targets::{Browsers, Features, Targets},
    visitor::Visit,
};
use napi::{
    Env, JsValue,
    bindgen_prelude::{
        Buffer, Function, JsObjectValue, Null, Object, ToNapiValue, Unknown as JsUnknown,
    },
};
use parcel_sourcemap::SourceMap;
use serde::{Deserialize, Serialize};

mod at_rule_parser;
mod transformer;
mod utils;

use transformer::JsVisitor;
use utils::{as_object, get_named_object};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TransformResult<'i> {
    #[serde(with = "serde_bytes")]
    code: Vec<u8>,
    #[serde(with = "serde_bytes")]
    map: Option<Vec<u8>>,
    exports: Option<CssModuleExports>,
    references: Option<CssModuleReferences>,
    dependencies: Option<Vec<Dependency>>,
    warnings: Vec<Warning<'i>>,
}

impl<'i> TransformResult<'i> {
    fn into_js<'env>(self, env: &'env Env) -> napi::Result<JsUnknown<'env>> {
        let mut obj = Object::new(env)?;
        obj.set_named_property("code", Buffer::from(self.code))?;
        if let Some(map) = self.map {
            obj.set_named_property("map", Buffer::from(map))?;
        } else {
            obj.set_named_property("map", Null)?;
        }
        obj.set_named_property("exports", env.to_js_value(&self.exports)?)?;
        obj.set_named_property("references", env.to_js_value(&self.references)?)?;
        obj.set_named_property("dependencies", env.to_js_value(&self.dependencies)?)?;
        obj.set_named_property("warnings", env.to_js_value(&self.warnings)?)?;
        Ok(obj.to_unknown())
    }
}

fn get_visitor(env: &Env, opts: &Object<'_>) -> Option<JsVisitor> {
    get_named_object(opts, "visitor").map(|visitor| JsVisitor::new(*env, visitor))
}

pub fn transform<'env>(env: &'env Env, opts: Object<'_>) -> napi::Result<JsUnknown<'env>> {
    let mut visitor = get_visitor(env, &opts);

    let config: Config = env.from_js_value(opts)?;
    let code = unsafe { std::str::from_utf8_unchecked(&config.code) };
    let res = compile(code, &config, &mut visitor);

    match res {
        Ok(res) => res.into_js(env),
        Err(err) => Err(err.into_js_error(*env, Some(code))?),
    }
}

pub fn transform_style_attribute<'env>(
    env: &'env Env,
    opts: Object<'_>,
) -> napi::Result<JsUnknown<'env>> {
    let mut visitor = get_visitor(env, &opts);

    let config: AttrConfig = env.from_js_value(opts)?;
    let code = unsafe { std::str::from_utf8_unchecked(&config.code) };
    let res = compile_attr(code, &config, &mut visitor);

    match res {
        Ok(res) => res.into_js(env),
        Err(err) => Err(err.into_js_error(*env, Some(code))?),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    pub filename: Option<String>,
    pub project_root: Option<String>,
    #[serde(with = "serde_bytes")]
    pub code: Vec<u8>,
    pub targets: Option<Browsers>,
    #[serde(default)]
    pub include: u32,
    #[serde(default)]
    pub exclude: u32,
    pub minify: Option<bool>,
    pub source_map: Option<bool>,
    pub input_source_map: Option<String>,
    pub drafts: Option<Drafts>,
    pub non_standard: Option<NonStandard>,
    pub css_modules: Option<CssModulesOption>,
    pub analyze_dependencies: Option<AnalyzeDependenciesOption>,
    pub pseudo_classes: Option<OwnedPseudoClasses>,
    pub unused_symbols: Option<HashSet<String>>,
    pub error_recovery: Option<bool>,
    pub custom_at_rules: Option<HashMap<String, CustomAtRuleConfig>>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AnalyzeDependenciesOption {
    Bool(bool),
    Config(AnalyzeDependenciesConfig),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeDependenciesConfig {
    preserve_imports: bool,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum CssModulesOption {
    Bool(bool),
    Config(CssModulesConfig),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CssModulesConfig {
    pattern: Option<String>,
    dashed_idents: Option<bool>,
    animation: Option<bool>,
    container: Option<bool>,
    grid: Option<bool>,
    custom_idents: Option<bool>,
    pure: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OwnedPseudoClasses {
    pub hover: Option<String>,
    pub active: Option<String>,
    pub focus: Option<String>,
    pub focus_visible: Option<String>,
    pub focus_within: Option<String>,
}

impl<'a> Into<PseudoClasses<'a>> for &'a OwnedPseudoClasses {
    fn into(self) -> PseudoClasses<'a> {
        PseudoClasses {
            hover: self.hover.as_deref(),
            active: self.active.as_deref(),
            focus: self.focus.as_deref(),
            focus_visible: self.focus_visible.as_deref(),
            focus_within: self.focus_within.as_deref(),
        }
    }
}

#[derive(Serialize, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Drafts {
    #[serde(default)]
    custom_media: bool,
    #[serde(default)]
    scroll_navigation_controls: bool,
}

#[derive(Serialize, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NonStandard {
    #[serde(default)]
    deep_selector_combinator: bool,
}

fn compile<'i>(
    code: &'i str,
    config: &Config,
    visitor: &mut Option<JsVisitor>,
) -> Result<TransformResult<'i>, CompileError<'i>> {
    let drafts = config.drafts.as_ref();
    let non_standard = config.non_standard.as_ref();
    let warnings = Some(Arc::new(RwLock::new(Vec::new())));

    let filename = config.filename.clone().unwrap_or_default();
    let project_root = config.project_root.as_ref().map(|p| p.as_ref());
    let mut source_map = if config.source_map.unwrap_or_default() {
        let mut sm = SourceMap::new(project_root.unwrap_or("/"));
        sm.add_source(&filename);
        sm.set_source_content(0, code)?;
        Some(sm)
    } else {
        None
    };

    let res = {
        let mut flags = ParserFlags::empty();
        flags.set(
            ParserFlags::CUSTOM_MEDIA,
            matches!(drafts, Some(d) if d.custom_media),
        );
        flags.set(
            ParserFlags::SCROLL_NAVIGATION_CONTROLS,
            matches!(drafts, Some(d) if d.scroll_navigation_controls),
        );
        flags.set(
            ParserFlags::DEEP_SELECTOR_COMBINATOR,
            matches!(non_standard, Some(v) if v.deep_selector_combinator),
        );

        let mut stylesheet = StyleSheet::parse_with(
            &code,
            ParserOptions {
                filename: filename.clone(),
                flags,
                css_modules: if let Some(css_modules) = &config.css_modules {
                    match css_modules {
                        CssModulesOption::Bool(true) => {
                            Some(lightningcss::css_modules::Config::default())
                        }
                        CssModulesOption::Bool(false) => None,
                        CssModulesOption::Config(c) => Some(lightningcss::css_modules::Config {
                            pattern: if let Some(pattern) = c.pattern.as_ref() {
                                match lightningcss::css_modules::Pattern::parse(pattern) {
                                    Ok(p) => p,
                                    Err(e) => return Err(CompileError::PatternError(e)),
                                }
                            } else {
                                Default::default()
                            },
                            dashed_idents: c.dashed_idents.unwrap_or_default(),
                            animation: c.animation.unwrap_or(true),
                            container: c.container.unwrap_or(true),
                            grid: c.grid.unwrap_or(true),
                            custom_idents: c.custom_idents.unwrap_or(true),
                            pure: c.pure.unwrap_or_default(),
                        }),
                    }
                } else {
                    None
                },
                source_index: 0,
                error_recovery: config.error_recovery.unwrap_or_default(),
                warnings: warnings.clone(),
            },
            &mut CustomAtRuleParser {
                configs: config.custom_at_rules.clone().unwrap_or_default(),
            },
        )?;

        if let Some(visitor) = visitor.as_mut() {
            stylesheet.visit(visitor).map_err(CompileError::JsError)?;
        }

        let targets = Targets {
            browsers: config.targets,
            include: Features::from_bits_truncate(config.include),
            exclude: Features::from_bits_truncate(config.exclude),
        };

        stylesheet.minify(MinifyOptions {
            targets,
            unused_symbols: config.unused_symbols.clone().unwrap_or_default(),
        })?;

        stylesheet.to_css(PrinterOptions {
            minify: config.minify.unwrap_or_default(),
            source_map: source_map.as_mut(),
            project_root,
            targets,
            analyze_dependencies: if let Some(d) = &config.analyze_dependencies {
                match d {
                    AnalyzeDependenciesOption::Bool(b) if *b => Some(DependencyOptions {
                        remove_imports: true,
                    }),
                    AnalyzeDependenciesOption::Config(c) => Some(DependencyOptions {
                        remove_imports: !c.preserve_imports,
                    }),
                    _ => None,
                }
            } else {
                None
            },
            pseudo_classes: config.pseudo_classes.as_ref().map(|p| p.into()),
        })?
    };

    let map = if let Some(mut source_map) = source_map {
        if let Some(input_source_map) = &config.input_source_map {
            if let Ok(mut sm) = SourceMap::from_json("/", input_source_map) {
                let _ = source_map.extends(&mut sm);
            }
        }

        source_map.to_json(None).ok()
    } else {
        None
    };

    Ok(TransformResult {
        code: res.code.into_bytes(),
        map: map.map(|m| m.into_bytes()),
        exports: res.exports,
        references: res.references,
        dependencies: res.dependencies,
        warnings: warnings.map_or(Vec::new(), |w| {
            Arc::try_unwrap(w)
                .unwrap()
                .into_inner()
                .unwrap()
                .into_iter()
                .map(|w| w.into())
                .collect()
        }),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttrConfig {
    pub filename: Option<String>,
    #[serde(with = "serde_bytes")]
    pub code: Vec<u8>,
    pub targets: Option<Browsers>,
    #[serde(default)]
    pub include: u32,
    #[serde(default)]
    pub exclude: u32,
    #[serde(default)]
    pub minify: bool,
    #[serde(default)]
    pub analyze_dependencies: bool,
    #[serde(default)]
    pub error_recovery: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AttrResult<'i> {
    #[serde(with = "serde_bytes")]
    code: Vec<u8>,
    dependencies: Option<Vec<Dependency>>,
    warnings: Vec<Warning<'i>>,
}

impl<'i> AttrResult<'i> {
    fn into_js<'env>(self, env: &'env Env) -> napi::Result<JsUnknown<'env>> {
        let mut obj = Object::new(env)?;
        obj.set_named_property("code", Buffer::from(self.code))?;
        obj.set_named_property("dependencies", env.to_js_value(&self.dependencies)?)?;
        obj.set_named_property("warnings", env.to_js_value(&self.warnings)?)?;
        Ok(obj.to_unknown())
    }
}

fn compile_attr<'i>(
    code: &'i str,
    config: &AttrConfig,
    visitor: &mut Option<JsVisitor>,
) -> Result<AttrResult<'i>, CompileError<'i>> {
    let warnings = if config.error_recovery {
        Some(Arc::new(RwLock::new(Vec::new())))
    } else {
        None
    };
    let res = {
        let filename = config.filename.clone().unwrap_or_default();
        let mut attr = StyleAttribute::parse(
            &code,
            ParserOptions {
                filename,
                error_recovery: config.error_recovery,
                warnings: warnings.clone(),
                ..ParserOptions::default()
            },
        )?;

        if let Some(visitor) = visitor.as_mut() {
            attr.visit(visitor).unwrap();
        }

        let targets = Targets {
            browsers: config.targets,
            include: Features::from_bits_truncate(config.include),
            exclude: Features::from_bits_truncate(config.exclude),
        };

        attr.minify(MinifyOptions {
            targets,
            ..MinifyOptions::default()
        });
        attr.to_css(PrinterOptions {
            minify: config.minify,
            source_map: None,
            project_root: None,
            targets,
            analyze_dependencies: if config.analyze_dependencies {
                Some(DependencyOptions::default())
            } else {
                None
            },
            pseudo_classes: None,
        })?
    };
    Ok(AttrResult {
        code: res.code.into_bytes(),
        dependencies: res.dependencies,
        warnings: warnings.map_or(Vec::new(), |w| {
            Arc::try_unwrap(w)
                .unwrap()
                .into_inner()
                .unwrap()
                .into_iter()
                .map(|w| w.into())
                .collect()
        }),
    })
}

enum CompileError<'i> {
    ParseError(Error<ParserError<'i>>),
    MinifyError(Error<MinifyErrorKind>),
    PrinterError(Error<PrinterErrorKind>),
    SourceMapError(parcel_sourcemap::SourceMapError),
    PatternError(PatternParseError),
    JsError(napi::Error),
}

impl<'i> std::fmt::Display for CompileError<'i> {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            CompileError::ParseError(err) => err.kind.fmt(f),
            CompileError::MinifyError(err) => err.kind.fmt(f),
            CompileError::PrinterError(err) => err.kind.fmt(f),
            CompileError::PatternError(err) => err.fmt(f),
            CompileError::SourceMapError(err) => write!(f, "{}", err.to_string()),
            CompileError::JsError(err) => std::fmt::Debug::fmt(&err, f),
        }
    }
}

impl<'i> CompileError<'i> {
    fn into_js_error(self, env: Env, code: Option<&str>) -> napi::Result<napi::Error> {
        let reason = self.to_string();
        let data = match &self {
            CompileError::ParseError(Error { kind, .. }) => env.to_js_value(kind)?,
            CompileError::PrinterError(Error { kind, .. }) => env.to_js_value(kind)?,
            CompileError::MinifyError(Error { kind, .. }) => env.to_js_value(kind)?,
            _ => Null.into_unknown(&env)?,
        };

        let (js_error, loc) = match self {
            CompileError::ParseError(Error { loc, .. })
            | CompileError::PrinterError(Error { loc, .. })
            | CompileError::MinifyError(Error { loc, .. }) => {
                let syntax_error: Function<'_> = env
                    .get_global()?
                    .get_named_property_unchecked::<Function>("SyntaxError")?;
                let reason = env.create_string_from_std(reason)?;
                let instance = syntax_error.new_instance(reason.to_unknown())?;
                (instance, loc)
            }
            _ => return Ok(self.into()),
        };

        if js_error.get_type()? == napi::ValueType::Object {
            let mut obj = as_object(js_error)
                .ok_or_else(|| napi::Error::from_reason("SyntaxError instance is not an object"))?;
            if let Some(loc) = loc {
                let line = env.create_int32((loc.line + 1) as i32)?;
                let col = env.create_int32(loc.column as i32)?;
                let filename = env.create_string_from_std(loc.filename)?;
                obj.set_named_property("fileName", filename)?;
                if let Some(code) = code {
                    let source = env.create_string(code)?;
                    obj.set_named_property("source", source)?;
                }
                let mut loc = Object::new(&env)?;
                loc.set_named_property("line", line)?;
                loc.set_named_property("column", col)?;
                obj.set_named_property("loc", loc)?;
            }
            obj.set_named_property("data", data)?;
            Ok(obj.to_unknown().into())
        } else {
            Ok(js_error.into())
        }
    }
}

impl<'i> From<Error<ParserError<'i>>> for CompileError<'i> {
    fn from(e: Error<ParserError<'i>>) -> CompileError<'i> {
        CompileError::ParseError(e)
    }
}

impl<'i> From<Error<MinifyErrorKind>> for CompileError<'i> {
    fn from(err: Error<MinifyErrorKind>) -> CompileError<'i> {
        CompileError::MinifyError(err)
    }
}

impl<'i> From<Error<PrinterErrorKind>> for CompileError<'i> {
    fn from(err: Error<PrinterErrorKind>) -> CompileError<'i> {
        CompileError::PrinterError(err)
    }
}

impl<'i> From<parcel_sourcemap::SourceMapError> for CompileError<'i> {
    fn from(e: parcel_sourcemap::SourceMapError) -> CompileError<'i> {
        CompileError::SourceMapError(e)
    }
}

impl<'i> From<CompileError<'i>> for napi::Error {
    fn from(e: CompileError<'i>) -> napi::Error {
        match e {
            CompileError::SourceMapError(e) => napi::Error::from_reason(e.to_string()),
            CompileError::PatternError(e) => napi::Error::from_reason(e.to_string()),
            CompileError::JsError(e) => e,
            _ => napi::Error::new(napi::Status::GenericFailure, e.to_string()),
        }
    }
}

#[derive(Serialize)]
struct Warning<'i> {
    message: String,
    #[serde(flatten)]
    data: ParserError<'i>,
    loc: Option<ErrorLocation>,
}

impl<'i> From<Error<ParserError<'i>>> for Warning<'i> {
    fn from(mut e: Error<ParserError<'i>>) -> Self {
        if let Some(loc) = &mut e.loc {
            loc.line += 1;
        }
        Warning {
            message: e.kind.to_string(),
            data: e.kind,
            loc: e.loc,
        }
    }
}
