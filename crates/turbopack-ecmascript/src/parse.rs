use std::{
    fmt::Display,
    io::Write,
    mem::take,
    rc::Rc,
    sync::{Arc, RwLock},
};

use anyhow::Result;
use swc_core::{
    common::{
        comments::{SingleThreadedComments, SingleThreadedCommentsMapInner},
        errors::{Handler, HANDLER},
        input::StringInput,
        source_map::SourceMapGenConfig,
        sync::Lrc,
        util::take::Take,
        BytePos, FileName, Globals, LineCol, Mark, SourceMap, GLOBALS,
    },
    ecma::{
        ast::{EsVersion, Module, Program},
        parser::{lexer::Lexer, EsConfig, Parser, Syntax, TsConfig},
        transforms::{
            base::{helpers::Helpers, resolver},
            react::react,
        },
        visit::{FoldWith, VisitMutWith},
    },
};
use turbo_tasks::{primitives::StringVc, Value, ValueToString};
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    asset::AssetVc,
    code_builder::{EncodedSourceMap, EncodedSourceMapVc},
};

use super::ModuleAssetType;
use crate::{analyzer::graph::EvalContext, emitter::IssueEmitter};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum EcmascriptInputTransform {
    React {
        #[serde(default)]
        refresh: bool,
    },
    CommonJs,
    StyledJsx,
    Custom,
}

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash, Clone)]
pub struct EcmascriptInputTransforms(Vec<EcmascriptInputTransform>);

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
#[allow(clippy::large_enum_variant)]
pub enum ParseResult {
    Ok {
        #[turbo_tasks(trace_ignore)]
        program: Program,
        #[turbo_tasks(trace_ignore)]
        leading_comments: SingleThreadedCommentsMapInner,
        #[turbo_tasks(trace_ignore)]
        trailing_comments: SingleThreadedCommentsMapInner,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        eval_context: EvalContext,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        globals: Globals,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        source_map: Arc<SourceMap>,
    },
    Unparseable,
    NotFound,
}

impl PartialEq for ParseResult {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Ok { .. }, Self::Ok { .. }) => false,
            _ => core::mem::discriminant(self) == core::mem::discriminant(other),
        }
    }
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub struct ParseResultSourceMap {
    /// Confusingly, SWC's SourceMap is not a mapping of transformed locations
    /// to source locations. I don't know what it is, really, but it's not
    /// that.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    source_map: Arc<SourceMap>,

    /// The position mappings that can generate a real source map given a (SWC)
    /// SourceMap.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    mappings: Vec<(BytePos, LineCol)>,
}

impl PartialEq for ParseResultSourceMap {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.source_map, &other.source_map) && self.mappings == other.mappings
    }
}

impl ParseResultSourceMap {
    pub fn new(source_map: Arc<SourceMap>, mappings: Vec<(BytePos, LineCol)>) -> Self {
        ParseResultSourceMap {
            source_map,
            mappings,
        }
    }
}

#[turbo_tasks::value_impl]
impl EncodedSourceMap for ParseResultSourceMap {
    #[turbo_tasks::function]
    fn encoded_map(&self) -> Result<StringVc> {
        let source_map = self.source_map.build_source_map_with_config(
            // SWC expects a mutable vec, but it never modifies. Seems like an oversight.
            &mut self.mappings.clone(),
            None,
            InlineSourcesContentConfig {},
        );
        let mut bytes = vec![];
        source_map.to_writer(&mut bytes)?;
        let s = String::from_utf8(bytes)?;
        Ok(StringVc::cell(s))
    }
}

/// A config to generate a source map which includes the source content of every
/// source file. SWC doesn't inline sources content by default when generating a
/// sourcemap, so we need to provide a custom config to do it.
struct InlineSourcesContentConfig {}

impl SourceMapGenConfig for InlineSourcesContentConfig {
    fn file_name_to_source(&self, f: &FileName) -> String {
        match f {
            // The Custom filename surrounds the name with <>.
            FileName::Custom(s) => String::from("/") + s,
            _ => f.to_string(),
        }
    }

    fn inline_sources_content(&self, _f: &FileName) -> bool {
        true
    }
}

#[derive(Clone)]
pub struct Buffer {
    buf: Arc<RwLock<Vec<u8>>>,
}

impl Buffer {
    pub fn new() -> Self {
        Self {
            buf: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.buf.read().unwrap().is_empty()
    }
}

impl Display for Buffer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Ok(str) = std::str::from_utf8(&self.buf.read().unwrap()) {
            let mut lines = str
                .lines()
                .map(|line| {
                    if line.len() > 300 {
                        format!("{}...{}\n", &line[..150], &line[line.len() - 150..])
                    } else {
                        format!("{}\n", line)
                    }
                })
                .collect::<Vec<_>>();
            if lines.len() > 500 {
                let (first, rem) = lines.split_at(250);
                let (_, last) = rem.split_at(rem.len() - 250);
                lines = first
                    .iter()
                    .chain(&["...".to_string()])
                    .chain(last.iter())
                    .cloned()
                    .collect();
            }
            let str = lines.concat();
            write!(f, "{}", str)
        } else {
            Err(std::fmt::Error)
        }
    }
}

impl Write for Buffer {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.buf.write().unwrap().extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[turbo_tasks::function]
pub async fn parse(
    source: AssetVc,
    ty: Value<ModuleAssetType>,
    transforms: EcmascriptInputTransformsVc,
) -> Result<ParseResultVc> {
    let content = source.content();
    let fs_path = source.path().to_string().await?.clone_value();
    let ty = ty.into_value();
    let transforms = transforms.await?;
    Ok(match &*content.await? {
        FileContent::NotFound => ParseResult::NotFound.into(),
        FileContent::Content(file) => match String::from_utf8(file.content().to_vec()) {
            Err(_err) => ParseResult::Unparseable.into(),
            Ok(string) => {
                let cm: Lrc<SourceMap> = Default::default();
                let handler = Handler::with_emitter(
                    true,
                    false,
                    box IssueEmitter {
                        source,
                        title: Some("Parsing failed".to_string()),
                    },
                );

                let file_name = FileName::Custom(fs_path);
                let fm = cm.new_source_file(file_name.clone(), string);

                let comments = SingleThreadedComments::default();
                let lexer = Lexer::new(
                    match ty {
                        ModuleAssetType::Ecmascript => Syntax::Es(EsConfig {
                            jsx: true,
                            fn_bind: true,
                            decorators: true,
                            decorators_before_export: true,
                            export_default_from: true,
                            import_assertions: true,
                            private_in_object: true,
                            allow_super_outside_method: true,
                            allow_return_outside_function: true,
                        }),
                        ModuleAssetType::Typescript => Syntax::Typescript(TsConfig {
                            decorators: true,
                            dts: false,
                            no_early_errors: true,
                            tsx: true,
                        }),
                        ModuleAssetType::TypescriptDeclaration => Syntax::Typescript(TsConfig {
                            decorators: true,
                            dts: true,
                            no_early_errors: true,
                            tsx: true,
                        }),
                    },
                    EsVersion::latest(),
                    StringInput::from(&*fm),
                    Some(&comments),
                );

                let mut parser = Parser::new_from(lexer);

                let mut has_errors = false;
                for e in parser.take_errors() {
                    e.into_diagnostic(&handler).emit();
                    has_errors = true
                }

                if has_errors {
                    return Ok(ParseResult::Unparseable.into());
                }

                match parser.parse_program() {
                    Err(e) => {
                        e.into_diagnostic(&handler).emit();
                        return Ok(ParseResult::Unparseable.into());
                    }
                    Ok(mut parsed_program) => {
                        drop(parser);
                        let globals = Globals::new();
                        let eval_context = GLOBALS.set(&globals, || {
                                let unresolved_mark = Mark::new();
                                let top_level_mark = Mark::new();
                                HANDLER.set(&handler, || {
                                    parsed_program.visit_mut_with(&mut resolver(
                                        unresolved_mark,
                                        top_level_mark,
                                        false,
                                    ));

                                    swc_core::ecma::transforms::base::helpers::HELPERS.set(
                                        &Helpers::new(true),
                                        || {
                                            for transform in transforms.iter() {
                                                match transform {
                                                    EcmascriptInputTransform::React { refresh } => {
                                                        parsed_program.visit_mut_with(&mut react(
                                                            cm.clone(),
                                                            Some(comments.clone()),
                                                            swc_core::ecma::transforms::react::Options {
                                                                runtime: Some(
                                                                    swc_core::ecma::transforms::react::Runtime::Automatic,
                                                                ),
                                                                refresh: if *refresh {
                                                                    Some(
                                                                        swc_core::ecma::transforms::react::RefreshOptions {
                                                                            ..Default::default()
                                                                        }
                                                                    )
                                                                } else { None },
                                                                ..Default::default()
                                                            },
                                                            top_level_mark,
                                                        ));
                                                    }
                                                    EcmascriptInputTransform::CommonJs => {
                                                        parsed_program.visit_mut_with(
                                                            &mut swc_core::ecma::transforms::module::common_js(
                                                                unresolved_mark,
                                                                swc_core::ecma::transforms::module::util::Config {
                                                                    allow_top_level_this: true,
                                                                    import_interop: Some(swc_core::ecma::transforms::module::util::ImportInterop::Swc),
                                                                    ..Default::default()
                                                                },
                                                                swc_core::ecma::transforms::base::feature::FeatureFlag::all(),
                                                                Some(comments.clone()),
                                                            ),
                                                        );
                                                    },
                                                    EcmascriptInputTransform::StyledJsx => {
                                                        // Modeled after https://github.com/swc-project/plugins/blob/ae735894cdb7e6cfd776626fe2bc580d3e80fed9/packages/styled-jsx/src/lib.rs
                                                        let real_parsed_program = std::mem::replace(&mut parsed_program, Program::Module(Module::dummy()));
                                                        parsed_program = real_parsed_program.fold_with(&mut styled_jsx::styled_jsx(cm.clone(), file_name.clone()));
                                                    },
                                                    EcmascriptInputTransform::Custom => todo!()
                                                }
                                            }
                                        },
                                    );
                                });

                                EvalContext::new(&parsed_program, unresolved_mark)
                            });

                        let (mut leading, mut trailing) = comments.take_all();
                        ParseResult::Ok {
                            program: parsed_program,
                            leading_comments: take(Rc::make_mut(&mut leading)).into_inner(),
                            trailing_comments: take(Rc::make_mut(&mut trailing)).into_inner(),
                            eval_context,
                            globals,
                            source_map: cm,
                        }
                        .into()
                    }
                }
            }
        },
    })
}
