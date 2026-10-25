use std::{
    collections::BTreeMap,
    io,
    sync::{Arc, Mutex},
};

use swc_core::{
    common::{BytePos, SourceMap, SourceMapper, Span},
    ecma::{
        ast::{Callee, EsVersion, Expr, Program},
        codegen::text_writer::{BindingStorage, ScopeKind, WriteJs},
        parser::{StringInput, Syntax, lexer::Lexer},
        visit::{Visit, VisitWith},
    },
};

// Input sites come from the resolved adapter transform, never a naming convention.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct OwnedCall {
    pub call: Span,
    pub callee: Span,
}

pub type CapturedCalls = Arc<Mutex<Vec<OwnedCall>>>;

pub(crate) fn prepare_call_mappings(
    program: &Program,
    source_map: &SourceMap,
    owned: &[OwnedCall],
) -> BTreeMap<BytePos, Vec<(String, BytePos)>> {
    let mut sites = owned.to_vec();
    sites.sort_by_key(|site| {
        (
            site.call.lo.0,
            site.call.hi.0,
            site.callee.lo.0,
            site.callee.hi.0,
        )
    });
    sites.dedup();
    struct ActualCalls<'a> {
        sites: &'a [OwnedCall],
        found: Vec<Vec<String>>,
    }
    impl Visit for ActualCalls<'_> {
        fn visit_call_expr(&mut self, call: &swc_core::ecma::ast::CallExpr) {
            if call.type_args.is_none()
                && let Callee::Expr(callee) = &call.callee
                && let Expr::Ident(ident) = &**callee
            {
                for (index, site) in self.sites.iter().enumerate() {
                    if call.span == site.call && ident.span == site.callee {
                        self.found[index].push(ident.sym.to_string());
                    }
                }
            }
            call.visit_children_with(self);
        }
    }
    let mut actual = ActualCalls {
        sites: &sites,
        found: vec![Vec::new(); sites.len()],
    };
    program.visit_with(&mut actual);
    let mut candidates: BTreeMap<(BytePos, String), Vec<BytePos>> = BTreeMap::new();
    for (site, symbols) in sites.iter().zip(actual.found) {
        if let [symbol] = symbols.as_slice()
            && let Some(open) = argument_open(source_map, *site)
        {
            candidates
                .entry((site.callee.lo, symbol.clone()))
                .or_default()
                .push(open);
        }
    }
    let mut result: BTreeMap<BytePos, Vec<(String, BytePos)>> = BTreeMap::new();
    for ((callee, symbol), opens) in candidates {
        if let [open] = opens.as_slice() {
            result.entry(callee).or_default().push((symbol, *open));
        }
    }
    result
}

pub fn argument_open(source_map: &SourceMap, site: OwnedCall) -> Option<BytePos> {
    if site.call.is_dummy() || site.callee.is_dummy() || site.callee.hi >= site.call.hi {
        return None;
    }
    let gap = source_map
        .span_to_snippet(Span::new(site.callee.hi, site.call.hi))
        .ok()?;
    let mut lexer = Lexer::new(
        Syntax::Es(Default::default()),
        EsVersion::latest(),
        StringInput::new(&gap, site.callee.hi, site.call.hi),
        None,
    );
    let token = lexer.next()?;
    (source_map.span_to_snippet(token.span).ok()?.as_str() == "(").then_some(token.span.lo)
}

pub struct CallParenWriter<W> {
    inner: W,
    sites: BTreeMap<BytePos, Vec<(String, BytePos)>>,
    original: Option<BytePos>,
    pending: Option<BytePos>,
}

impl<W: WriteJs> CallParenWriter<W> {
    pub fn new(inner: W, sites: BTreeMap<BytePos, Vec<(String, BytePos)>>) -> Self {
        Self {
            inner,
            sites,
            original: None,
            pending: None,
        }
    }
}

macro_rules! delegate {
    ($($method:ident($($arg:ident: $ty:ty),*));* $(;)?) => {
        $(fn $method(&mut self, $($arg: $ty),*) -> io::Result<()> {
            self.pending = None;
            self.inner.$method($($arg),*)
        })*
    };
}

impl<W: WriteJs> WriteJs for CallParenWriter<W> {
    delegate! {
        increase_indent();
        decrease_indent();
        write_semi(span: Option<Span>);
        write_space();
        write_keyword(span: Option<Span>, s: &'static str);
        write_operator(span: Option<Span>, s: &str);
        write_param(s: &str);
        write_property(s: &str);
        write_line();
        write_lit(span: Span, s: &str);
        write_comment(s: &str);
        write_str_lit(span: Span, s: &str);
        write_str(s: &str);
        commit_pending_semi();
        start_scope(name: Option<&str>, kind: ScopeKind, is_stack_frame: bool, is_hidden: bool, original_span: Option<Span>);
        end_scope();
        add_scope_variable(name: &str, expression: Option<&str>, storage: BindingStorage);
    }

    fn care_about_srcmap(&self) -> bool {
        self.inner.care_about_srcmap()
    }
    fn can_ignore_invalid_unicodes(&mut self) -> bool {
        self.inner.can_ignore_invalid_unicodes()
    }
    fn has_scope_tracking(&self) -> bool {
        self.inner.has_scope_tracking()
    }

    fn add_srcmap(&mut self, pos: BytePos) -> io::Result<()> {
        self.pending = None;
        self.original = Some(pos);
        self.inner.add_srcmap(pos)
    }

    fn write_symbol(&mut self, span: Span, symbol: &str) -> io::Result<()> {
        self.inner.write_symbol(span, symbol)?;
        self.pending = self
            .original
            .and_then(|pos| self.sites.get(&pos))
            .and_then(|sites| sites.iter().find(|(name, _)| name == symbol))
            .map(|(_, pos)| *pos);
        Ok(())
    }

    fn write_punct(
        &mut self,
        span: Option<Span>,
        punctuation: &'static str,
        commit_pending_semi: bool,
    ) -> io::Result<()> {
        if let Some(original) = self.pending.take().filter(|_| punctuation == "(") {
            if commit_pending_semi {
                self.inner.commit_pending_semi()?;
            }
            self.inner.add_srcmap(original)?;
        }
        self.inner
            .write_punct(span, punctuation, commit_pending_semi)
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, sync::Arc};

    use swc_core::{
        common::{FileName, LineCol, SourceMap, Spanned},
        ecma::{
            ast::*,
            codegen::{Emitter, text_writer::JsWriter},
            parser::{Parser, StringInput, Syntax},
        },
    };

    use super::*;

    fn parse(cm: &Arc<SourceMap>, source: &str) -> Module {
        let file = cm.new_source_file(
            FileName::Custom("case.mjs".into()).into(),
            source.to_owned(),
        );
        Parser::new(
            Syntax::Es(Default::default()),
            StringInput::from(&*file),
            None,
        )
        .parse_module()
        .unwrap()
    }

    fn call(module: &Module) -> &CallExpr {
        let ModuleItem::Stmt(Stmt::Expr(expr)) = &module.body[0] else {
            panic!("expression")
        };
        let Expr::Call(call) = &*expr.expr else {
            panic!("call")
        };
        call
    }

    #[test]
    fn emits_exact_actual_terminal_maps_and_identical_javascript_for_trivia() {
        for source in [
            "test('a')",
            "test /* block */ ('a')",
            "test\n('a')",
            "test // line\n('a')",
            "test /* multiline\n */ ('a')",
            "   test   ('a')",
        ] {
            let cm = Arc::<SourceMap>::default();
            let module = parse(&cm, source);
            let call = call(&module);
            let Callee::Expr(callee) = &call.callee else {
                panic!("callee")
            };
            let site = OwnedCall {
                call: call.span,
                callee: callee.span(),
            };
            let open = argument_open(&cm, site).expect("actual LParen");
            let file = cm.lookup_source_file(open);
            assert_eq!(
                source.as_bytes()[(open.0 - file.start_pos.0) as usize],
                b'('
            );
            let mut baseline = Vec::new();
            let mut baseline_maps = Vec::new();
            Emitter {
                cfg: Default::default(),
                cm: cm.clone(),
                comments: None,
                wr: JsWriter::new(cm.clone(), "\n", &mut baseline, Some(&mut baseline_maps)),
            }
            .emit_module(&module)
            .unwrap();
            let mut actual = Vec::new();
            let mut maps = Vec::new();
            let sites = BTreeMap::from([(site.callee.lo, vec![("test".into(), open)])]);
            Emitter {
                cfg: Default::default(),
                cm: cm.clone(),
                comments: None,
                wr: CallParenWriter::new(
                    JsWriter::new(cm.clone(), "\n", &mut actual, Some(&mut maps)),
                    sites,
                ),
            }
            .emit_module(&module)
            .unwrap();
            assert_eq!(actual, baseline);
            let generated = String::from_utf8(actual).unwrap();
            let index = generated.find('(').unwrap();
            let prefix = &generated[..index];
            let expected = LineCol {
                line: prefix.bytes().filter(|b| *b == b'\n').count() as u32,
                col: prefix.rsplit('\n').next().unwrap().len() as u32,
            };
            let position = maps
                .iter()
                .position(|item| *item == (open, expected))
                .expect("terminal association");
            maps.remove(position);
            assert_eq!(
                maps, baseline_maps,
                "all old mappings retained for {source:?}"
            );
        }
    }

    #[test]
    fn does_not_scan_past_a_non_parenthesis_token() {
        let cm = Arc::<SourceMap>::default();
        let module = parse(&cm, "(test)('a')");
        let call = call(&module);
        let Callee::Expr(callee) = &call.callee else {
            panic!("callee")
        };
        let Expr::Paren(paren) = &**callee else {
            panic!("parenthesized")
        };
        assert_eq!(
            argument_open(
                &cm,
                OwnedCall {
                    call: call.span,
                    callee: paren.expr.span()
                }
            ),
            None
        );
    }
}
