use rustc_hash::FxHashMap;
use swc_core::{
    common::{DUMMY_SP, Span},
    ecma::{
        ast::{CallExpr, Expr, JSXElement, JSXFragment, Program},
        visit::{Visit, VisitMut, VisitMutWith, VisitWith},
    },
};

/// Retain the source container boundary that automatic JSX lowering otherwise
/// loses when it constructs the props object with a dummy span.
#[derive(Default)]
pub(super) struct JsxPropsSourceSpans {
    spans: FxHashMap<Span, usize>,
}

impl JsxPropsSourceSpans {
    pub(super) fn capture(program: &Program) -> Self {
        let mut spans = Self::default();
        program.visit_with(&mut spans);
        // A cloned source span does not identify one original JSX container.
        spans
            .spans
            .retain(|span, count| !span.is_dummy() && *count == 1);
        for count in spans.spans.values_mut() {
            *count = 0;
        }
        spans
    }

    pub(super) fn restore(self, program: &mut Program) {
        if self.spans.is_empty() {
            return;
        }
        let mut generated = GeneratedJsxProps { spans: self.spans };
        program.visit_with(&mut generated);
        program.visit_mut_with(&mut generated);
    }
}

impl Visit for JsxPropsSourceSpans {
    fn visit_jsx_element(&mut self, element: &JSXElement) {
        *self.spans.entry(element.span).or_default() += 1;
        element.visit_children_with(self);
    }

    fn visit_jsx_fragment(&mut self, fragment: &JSXFragment) {
        *self.spans.entry(fragment.span).or_default() += 1;
        fragment.visit_children_with(self);
    }
}

struct GeneratedJsxProps {
    spans: FxHashMap<Span, usize>,
}

fn synthetic_props(call: &CallExpr) -> bool {
    call.args.get(1).is_some_and(|argument| {
        argument.spread.is_none()
            && matches!(&*argument.expr, Expr::Object(props) if props.span == DUMMY_SP)
    })
}

impl Visit for GeneratedJsxProps {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if let Some(count) = self.spans.get_mut(&call.span) {
            *count += 1;
        }
        call.visit_children_with(self);
    }
}

impl VisitMut for GeneratedJsxProps {
    fn visit_mut_call_expr(&mut self, call: &mut CallExpr) {
        call.visit_mut_children_with(self);
        if synthetic_props(call) && self.spans.get(&call.span) == Some(&1) {
            let Expr::Object(props) = &mut *call.args[1].expr else {
                unreachable!();
            };
            // The generated braces represent this original JSX container. Its
            // closing '>' is span.hi - 1, which the emitter maps at the closing
            // props brace. Child expressions retain their own original spans.
            props.span = call.span;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use swc_core::{
        base::SwcComments,
        common::{
            FileName, GLOBALS, Globals, Mark, SourceMap, Span, comments::Comments,
            source_map::DefaultSourceMapGenConfig,
        },
        ecma::{
            ast::{Expr, ModuleItem, Program, Stmt},
            codegen::{Emitter, text_writer::JsWriter},
            parser::{EsSyntax, Parser, StringInput, Syntax, TsSyntax},
            transforms::{
                base::helpers::{HELPERS, Helpers},
                react::{Options, Runtime, react},
                typescript::typescript,
            },
        },
    };

    use super::JsxPropsSourceSpans;

    fn emit(
        cm: Arc<SourceMap>,
        program: &Program,
        comments: &SwcComments,
        minify: bool,
    ) -> (String, swc_sourcemap::SourceMap) {
        let comments = SwcComments {
            leading: Arc::new((*comments.leading).clone()),
            trailing: Arc::new((*comments.trailing).clone()),
        };
        let mut output = Vec::new();
        let mut mappings = Vec::new();
        {
            let mut emitter = Emitter {
                cfg: swc_core::ecma::codegen::Config::default().with_minify(minify),
                cm: cm.clone(),
                comments: Some(&comments),
                wr: JsWriter::new(cm.clone(), "\n", &mut output, Some(&mut mappings)),
            };
            emitter.emit_program(program).unwrap();
        }
        let map = cm.build_source_map(&mappings, None, DefaultSourceMapGenConfig);
        (String::from_utf8(output).unwrap(), map)
    }

    fn lower(
        source: &str,
        tsx: bool,
    ) -> (
        Arc<SourceMap>,
        swc_core::common::BytePos,
        SwcComments,
        Program,
        Vec<Span>,
    ) {
        let cm: Arc<SourceMap> = Default::default();
        let file = cm.new_source_file(
            FileName::Custom("source.jsx".into()).into(),
            source.to_owned(),
        );
        let comments = SwcComments::default();
        let syntax = if tsx {
            Syntax::Typescript(TsSyntax {
                tsx: true,
                ..Default::default()
            })
        } else {
            Syntax::Es(EsSyntax {
                jsx: true,
                ..Default::default()
            })
        };
        let mut parser = Parser::new(syntax, StringInput::from(&*file), Some(&comments));
        let mut program = Program::Module(parser.parse_module().unwrap());
        let top_level_mark = Mark::new();
        let unresolved_mark = Mark::new();
        if tsx {
            program.mutate(typescript(
                Default::default(),
                unresolved_mark,
                top_level_mark,
            ));
        }
        let captured = JsxPropsSourceSpans::capture(&program);
        let original = captured.spans.keys().copied().collect::<Vec<_>>();
        let helpers = Helpers::new(false);
        HELPERS.set(&helpers, || {
            program.mutate(react::<&dyn Comments>(
                cm.clone(),
                Some(&comments),
                Options {
                    runtime: Some(Runtime::Automatic),
                    development: Some(true),
                    ..Default::default()
                },
                top_level_mark,
                unresolved_mark,
            ));
        });
        (cm, file.start_pos, comments, program, original)
    }

    fn assert_endpoints(
        source: &str,
        start: swc_core::common::BytePos,
        spans: &[Span],
        code: &str,
        map: &swc_sourcemap::SourceMap,
    ) {
        let lines = code.lines().collect::<Vec<_>>();
        for span in spans {
            let offset = (span.hi.0 - start.0 - 1) as usize;
            assert_eq!(&source[offset..offset + 1], ">");
            let prefix = &source[..offset];
            let line = prefix.bytes().filter(|byte| *byte == b'\n').count() as u32;
            let column = prefix.rsplit('\n').next().unwrap().encode_utf16().count() as u32;
            assert!(
                map.tokens().any(|token| {
                    token.has_source()
                        && token.get_src_line() == line
                        && token.get_src_col() == column
                        && lines[token.get_dst_line() as usize]
                            .encode_utf16()
                            .nth(token.get_dst_col() as usize)
                            == Some('}' as u16)
                }),
                "missing JSX closing-container boundary at {line}:{column}"
            );
        }
    }

    #[test]
    fn jsx_props_boundaries_preserve_emitted_bytes_and_original_endpoints() {
        GLOBALS.set(&Globals::new(), || {
            for (source, tsx) in [
                ("import React from 'react'\nexport function choose(value) {\n  return <span>{value.flag ? 'yes' : 'no'}</span>\n}\n", false),
                ("import React from 'react'\nexport function choose(value: {flag: boolean}) {\n  return <span>{value.flag ? 'yes' : 'no'}</span>\n}\n", true),
                ("const result = <b>{flag ? '👍' : 'no'}</b>", false),
                ("/* real first */\nconst x = <span title={actualFactory()}> {flag ? <i/> : <b/>} </span>;\n", false),
                ("const fragment = <>{flag ? <i/> : <b/>}</>", false),
            ] {
                let (cm, start, comments, baseline, original) = lower(source, tsx);
                let mut candidate = baseline.clone();
                // Capture before lowering is represented by the exact preserved
                // original JSX spans, never names or coordinates reconstructed
                // from emitted text.
                JsxPropsSourceSpans { spans: original.iter().map(|span| (*span, 0)).collect() }
                    .restore(&mut candidate);
                for minify in [false, true] {
                    let (before, before_map) = emit(cm.clone(), &baseline, &comments, minify);
                    let (after, map) = emit(cm.clone(), &candidate, &comments, minify);
                    assert_eq!(before, after, "source-map restoration changed emitted bytes");
                    assert_endpoints(source, start, &original, &after, &map);
                    for before in before_map.tokens().filter(|token| token.has_source()) {
                        // Preserve duplicate generated positions too: a lookup
                        // alone may select a different token at that position.
                        assert!(map.tokens().any(|after| {
                            after.get_dst_line() == before.get_dst_line()
                                && after.get_dst_col() == before.get_dst_col()
                                && after.get_source() == before.get_source()
                                && after.get_src_line() == before.get_src_line()
                                && after.get_src_col() == before.get_src_col()
                                && after.get_name() == before.get_name()
                        }));
                    }
                    // Both JSX and TSX controls derive 48 from the parsed JSX
                    // closing '>', matching the pristine transform's endpoint.
                    if source.contains("export function choose") {
                        assert!(map.tokens().any(|token| token.get_src_line() == 2 && token.get_src_col() == 48));
                    }
                }
            }
        });
    }

    #[test]
    fn jsx_container_boundaries_survive_subsequent_minification() {
        GLOBALS.set(&Globals::new(), || {
            let source =
                "export function choose(value) { return <span>{value ? 'yes' : 'no'}</span> }";
            let (cm, start, comments, mut program, original) = lower(source, false);
            JsxPropsSourceSpans {
                spans: original.iter().map(|span| (*span, 0)).collect(),
            }
            .restore(&mut program);
            let (intermediate, mut original_map) = emit(cm, &program, &comments, false);
            let cm: Arc<SourceMap> = Default::default();
            let file = cm.new_source_file(
                FileName::Custom("intermediate.js".into()).into(),
                intermediate,
            );
            let comments = SwcComments::default();
            let mut parser = Parser::new(
                Syntax::Es(Default::default()),
                StringInput::from(&*file),
                Some(&comments),
            );
            let program = Program::Module(parser.parse_module().unwrap());
            let (output, adjustment) = emit(cm, &program, &comments, true);
            original_map.adjust_mappings(&adjustment);
            assert_endpoints(source, start, &original, &output, &original_map);
        });
    }

    #[test]
    fn authored_props_spans_and_ambiguous_generated_calls_are_unchanged() {
        GLOBALS.set(&Globals::new(), || {
            let (cm, _, comments, mut program, original) = lower("const result = <b/>", false);
            let Program::Module(module) = &mut program else {
                unreachable!()
            };
            let item = module.body.last_mut().unwrap();
            let ModuleItem::Stmt(Stmt::Decl(swc_core::ecma::ast::Decl::Var(decl))) = item else {
                unreachable!()
            };
            let Expr::Call(call) = &mut **decl.decls[0].init.as_mut().unwrap() else {
                unreachable!()
            };
            let Expr::Object(props) = &mut *call.args[1].expr else {
                unreachable!()
            };
            props.span = original[0];
            let before = program.clone();
            JsxPropsSourceSpans {
                spans: original.iter().map(|span| (*span, 0)).collect(),
            }
            .restore(&mut program);
            assert_eq!(
                emit(cm.clone(), &before, &comments, false),
                emit(cm.clone(), &program, &comments, false)
            );

            let (_, _, _, mut program, original) = lower("const result = <b/>", false);
            let Program::Module(module) = &mut program else {
                unreachable!()
            };
            module.body.push(module.body.last().unwrap().clone());
            let before = serde_json::to_value(&program).unwrap();
            JsxPropsSourceSpans {
                spans: original.iter().map(|span| (*span, 0)).collect(),
            }
            .restore(&mut program);
            assert_eq!(serde_json::to_value(&program).unwrap(), before);
        });
    }

    #[test]
    fn ambiguous_original_jsx_spans_are_not_certified() {
        GLOBALS.set(&Globals::new(), || {
            let cm: Arc<SourceMap> = Default::default();
            let file = cm.new_source_file(
                FileName::Custom("source.jsx".into()).into(),
                "const result = <b/>".to_owned(),
            );
            let mut parser = Parser::new(
                Syntax::Es(EsSyntax {
                    jsx: true,
                    ..Default::default()
                }),
                StringInput::from(&*file),
                None,
            );
            let mut module = parser.parse_module().unwrap();
            module.body.push(module.body[0].clone());
            assert!(
                JsxPropsSourceSpans::capture(&Program::Module(module))
                    .spans
                    .is_empty()
            );
        });
    }
}
