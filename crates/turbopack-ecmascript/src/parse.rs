use std::{
    fmt::Display,
    io::Write,
    mem::take,
    rc::Rc,
    sync::{Arc, RwLock},
};

use anyhow::Result;
use swc_common::{
    comments::{SingleThreadedComments, SingleThreadedCommentsMapInner},
    errors::{Handler, HANDLER},
    input::StringInput,
    sync::Lrc,
    FileName, Globals, Mark, SourceMap, GLOBALS,
};
use swc_ecma_ast::{EsVersion, Program};
use swc_ecma_parser::{lexer::Lexer, EsConfig, Parser, Syntax, TsConfig};
use swc_ecma_transforms_base::{helpers::Helpers, resolver};
use swc_ecma_transforms_react::react;
use swc_ecma_visit::VisitMutWith;
use turbo_tasks::{Value, ValueToString};
use turbo_tasks_fs::FileContent;
use turbopack_core::asset::AssetVc;

use super::ModuleAssetType;
use crate::{analyzer::graph::EvalContext, emitter::IssueEmitter};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum EcmascriptInputTransform {
    JSX,
    CommonJs,
    Custom,
}

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Clone)]
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
    let fs_path = source.path().to_string().await?.clone();
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

                let fm = cm.new_source_file(FileName::Custom(fs_path), string);

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

                                    swc_ecma_transforms_base::helpers::HELPERS.set(
                                        &Helpers::new(true),
                                        || {
                                            for transform in transforms.iter() {
                                                match transform {
                                                    EcmascriptInputTransform::JSX => {
                                                        parsed_program.visit_mut_with(&mut react(
                                                            cm.clone(),
                                                            Some(comments.clone()),
                                                            swc_ecma_transforms_react::Options {
                                                                runtime: Some(
                                                                    swc_ecma_transforms_react::Runtime::Automatic,
                                                                ),
                                                                ..Default::default()
                                                            },
                                                            top_level_mark,
                                                        ));
                                                    }
                                                    EcmascriptInputTransform::CommonJs => {
                                                        parsed_program.visit_mut_with(
                                                            &mut swc_ecma_transforms_module::common_js(
                                                                unresolved_mark,
                                                                swc_ecma_transforms_module::util::Config {
                                                                    allow_top_level_this: true,
                                                                    import_interop: Some(swc_ecma_transforms_module::util::ImportInterop::Swc),
                                                                    ..Default::default()
                                                                },
                                                                swc_ecma_transforms_base::feature::FeatureFlag::all(),
                                                                Some(comments.clone()),
                                                            ),
                                                        );
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
