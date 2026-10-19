//! Private Node-test coverage roles. No authored span or emitted map token is changed.
use anyhow::{Context, Result, bail, ensure};
use swc_core::{
    common::{EqIgnoreSpan, FileName, SourceMap, Span},
    ecma::{
        ast::{Callee, Expr, Lit, MemberProp, Pat, Program, VarDecl},
        parser::{Parser, StringInput, Syntax},
        visit::{Visit, VisitWith},
    },
};

/// Constructed only by native ESM import code generation in an explicitly opted-in context.
#[derive(Clone)]
pub struct NativeImportCoverageRole {
    pub span: Span,
    pub call: Expr,
}

fn import_shape(declaration: &VarDecl) -> Option<(&str, &str, serde_json::Value)> {
    if declaration.decls.len() != 1 {
        return None;
    }
    let item = &declaration.decls[0];
    let Pat::Ident(binding) = &item.name else {
        return None;
    };
    let Expr::Call(call) = item.init.as_deref()? else {
        return None;
    };
    if call.args.len() != 1 || call.args[0].spread.is_some() {
        return None;
    }
    let Callee::Expr(callee) = &call.callee else {
        return None;
    };
    let Expr::Member(member) = &**callee else {
        return None;
    };
    let Expr::Ident(context) = &*member.obj else {
        return None;
    };
    let MemberProp::Ident(property) = &member.prop else {
        return None;
    };
    if property.sym != *"i" {
        return None;
    }
    let target = match &*call.args[0].expr {
        Expr::Lit(Lit::Str(value)) => {
            serde_json::json!({"kind":"string","value":value.value.to_string_lossy()})
        }
        Expr::Lit(Lit::Num(value))
            if value.value.is_finite() && value.value >= 0.0 && value.value.fract() == 0.0 =>
        {
            serde_json::json!({"kind":"number","value":value.value})
        }
        _ => return None,
    };
    Some((binding.id.sym.as_ref(), context.sym.as_ref(), target))
}

#[derive(Clone)]
pub(crate) struct OwnedDeclaration {
    binding: String,
    context: String,
    target: serde_json::Value,
    source: serde_json::Value,
}

fn position(text: &str, offset: usize, one_based: bool) -> Result<serde_json::Value> {
    let prefix = text
        .get(..offset)
        .context("Native coverage position is not a UTF8 boundary")?;
    let (mut line, mut column, mut cr) = (0, 0, false);
    for ch in prefix.chars() {
        match ch {
            '\r' => {
                line += 1;
                column = 0;
            }
            '\n' => {
                if !cr {
                    line += 1;
                }
                column = 0;
            }
            '\u{2028}' | '\u{2029}' => {
                line += 1;
                column = 0;
            }
            _ => column += ch.len_utf16(),
        }
        cr = ch == '\r';
    }
    Ok(serde_json::json!({"line":line + usize::from(one_based),"column":column}))
}

struct Declarations(Vec<VarDecl>);
impl Visit for Declarations {
    fn visit_var_decl(&mut self, declaration: &VarDecl) {
        self.0.push(declaration.clone());
        declaration.visit_children_with(self);
    }
}

/// Check the actual post-transform AST before it is dropped by the emitter.
/// A stale/deduplicated/replaced statement never becomes a role via source spelling.
pub(crate) fn prepare_native_import_coverage(
    program: &Program,
    source_map: &SourceMap,
    roles: Vec<NativeImportCoverageRole>,
) -> Result<Vec<OwnedDeclaration>> {
    let mut declarations = Declarations(Vec::new());
    program.visit_with(&mut declarations);
    let mut output = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for role in roles {
        ensure!(
            !role.span.is_dummy(),
            "Native import coverage origin is dummy"
        );
        let matches = declarations
            .0
            .iter()
            .filter(|declaration| declaration.span == role.span)
            .collect::<Vec<_>>();
        ensure!(
            matches.len() == 1,
            "Native import coverage statement changed or became ambiguous"
        );
        let declaration = matches[0];
        let (binding, context, target) =
            import_shape(declaration).context("Unsupported native import coverage initializer")?;
        ensure!(
            declaration.decls[0]
                .init
                .as_deref()
                .unwrap()
                .eq_ignore_span(&role.call),
            "Native import coverage operation changed"
        );
        ensure!(
            seen.insert(binding.to_owned()),
            "Native import coverage binding is ambiguous"
        );
        let source = source_map
            .files()
            .iter()
            .find(|source| source.start_pos <= role.span.lo && role.span.hi <= source.end_pos)
            .cloned()
            .context("Native import coverage source is absent")?;
        let start = role
            .span
            .lo
            .0
            .checked_sub(source.start_pos.0)
            .context("Native import coverage source start escaped")? as usize;
        let end = role
            .span
            .hi
            .0
            .checked_sub(source.start_pos.0)
            .context("Native import coverage source end escaped")? as usize;
        ensure!(
            start < end && end <= source.src.len(),
            "Native import coverage source range escaped"
        );
        output.push(OwnedDeclaration {
            binding: binding.to_owned(), context: context.to_owned(), target,
            source: serde_json::json!({"start":position(&source.src, start, true)?,"end":position(&source.src, end, true)?}),
        });
    }
    Ok(output)
}

/// Reparse only bytes actually emitted by this compiler. This performs no transform,
/// resolution or evaluation. Coordinates are relative to this exact native module.
pub(crate) fn emitted_native_import_coverage(
    bytes: &[u8],
    owned: Vec<OwnedDeclaration>,
) -> Result<serde_json::Value> {
    let code = std::str::from_utf8(bytes)?;
    let cm = SourceMap::default();
    let source = cm.new_source_file(
        FileName::Custom("native-import-coverage-output.js".into()).into(),
        code.to_owned(),
    );
    let mut parser = Parser::new(
        Syntax::Es(Default::default()),
        StringInput::from(&*source),
        None,
    );
    let program = parser.parse_program().map_err(|error| {
        anyhow::anyhow!("Cannot certify emitted native import bytes: {error:?}")
    })?;
    ensure!(
        parser.take_errors().is_empty(),
        "Cannot certify recovered emitted native import syntax"
    );
    let mut declarations = Declarations(Vec::new());
    program.visit_with(&mut declarations);
    let mut roles = Vec::new();
    for owner in owned {
        let matches = declarations
            .0
            .iter()
            .filter(|declaration| {
                import_shape(declaration).is_some_and(|(binding, context, target)| {
                    binding == owner.binding && context == owner.context && target == owner.target
                })
            })
            .collect::<Vec<_>>();
        ensure!(
            matches.len() == 1,
            "Emitted native import coverage binding is missing or ambiguous"
        );
        let declaration = matches[0];
        // Use the real emitted parser range, including its statement separator.
        let start = (declaration.span.lo.0 - source.start_pos.0) as usize;
        let end = (declaration.span.hi.0 - source.start_pos.0) as usize;
        roles.push(serde_json::json!({"kind":"esm-import-initializer","start":position(code,start,false)?,"end":position(code,end,false)?,"binding":owner.binding,"context":owner.context,"target":owner.target,"source":owner.source}));
    }
    // Sorted native emission ranges allow deterministic duplicate/overlap checks.
    roles.sort_by_key(|role| {
        (
            role["start"]["line"].as_u64().unwrap(),
            role["start"]["column"].as_u64().unwrap(),
        )
    });
    for pair in roles.windows(2) {
        let end = (&pair[0]["end"]["line"], &pair[0]["end"]["column"]);
        let start = (&pair[1]["start"]["line"], &pair[1]["start"]["column"]);
        if (end.0.as_u64(), end.1.as_u64()) > (start.0.as_u64(), start.1.as_u64()) {
            bail!("Overlapping native import coverage roles");
        }
    }
    Ok(serde_json::json!({"version":1,"moduleEnd":position(code,code.len(),false)?,"roles":roles}))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use swc_core::{
        common::{DUMMY_SP, GLOBALS, Globals, Spanned},
        ecma::{
            ast::{Decl, ModuleDecl, ModuleItem, Stmt, VarDeclKind},
            codegen::{Emitter, text_writer::JsWriter},
            visit::{VisitMut, VisitMutWith},
        },
    };

    use super::*;

    struct DummySpans;
    impl VisitMut for DummySpans {
        fn visit_mut_span(&mut self, span: &mut Span) {
            *span = DUMMY_SP;
        }
    }
    fn fixture(source: &str) -> (Arc<SourceMap>, Program, NativeImportCoverageRole) {
        let cm = Arc::new(SourceMap::default());
        let file = cm.new_source_file(
            FileName::Custom("authored.js".into()).into(),
            source.to_owned(),
        );
        let mut parser = Parser::new(
            Syntax::Es(Default::default()),
            StringInput::from(&*file),
            None,
        );
        let mut program = Program::Module(parser.parse_module().unwrap());
        let native_file = cm.new_source_file(
            FileName::Custom("native-template.js".into()).into(),
            "var nativeBinding = context.i('module');".to_owned(),
        );
        let mut parser = Parser::new(
            Syntax::Es(Default::default()),
            StringInput::from(&*native_file),
            None,
        );
        let mut statement = parser.parse_module().unwrap().body.remove(0);
        statement.visit_mut_with(&mut DummySpans);
        let Program::Module(module) = &mut program else {
            unreachable!()
        };
        let index = module
            .body
            .iter()
            .position(|item| matches!(item, ModuleItem::ModuleDecl(ModuleDecl::Import(_))))
            .unwrap();
        let span = module.body[index].span();
        let ModuleItem::Stmt(Stmt::Decl(Decl::Var(declaration))) = &mut statement else {
            unreachable!()
        };
        declaration.span = span;
        assert_eq!(declaration.kind, VarDeclKind::Var);
        let role = NativeImportCoverageRole {
            span,
            call: *declaration.decls[0].init.clone().unwrap(),
        };
        module.body[index] = statement;
        (cm, program, role)
    }
    fn emit(
        cm: Arc<SourceMap>,
        program: &Program,
    ) -> (
        Vec<u8>,
        Vec<(swc_core::common::BytePos, swc_core::common::LineCol)>,
    ) {
        let mut output = Vec::new();
        let mut mappings = Vec::new();
        {
            let mut emitter = Emitter {
                cfg: Default::default(),
                cm: cm.clone(),
                comments: None,
                wr: JsWriter::new(cm, "\n", &mut output, Some(&mut mappings)),
            };
            emitter.emit_program(program).unwrap();
        }
        (output, mappings)
    }
    #[test]
    fn certifies_real_emitted_ranges_without_changing_bytes_or_tokens() {
        GLOBALS.set(&Globals::new(), || {
            let (cm, program, role) =
                fixture("import React from 'react'; export const value = '😀';");
            let before = emit(cm.clone(), &program);
            let owned = prepare_native_import_coverage(&program, &cm, vec![role]).unwrap();
            let roles = emitted_native_import_coverage(&before.0, owned).unwrap();
            assert_eq!(before, emit(cm, &program));
            let text = std::str::from_utf8(&before.0).unwrap();
            let start = text.find("var nativeBinding").unwrap();
            let end = text[start..].find(';').unwrap() + start + 1;
            assert_eq!(
                roles["roles"][0]["start"],
                position(text, start, false).unwrap()
            );
            assert_eq!(
                roles["roles"][0]["end"],
                position(text, end, false).unwrap()
            );
            assert_eq!(
                roles["roles"][0]["source"],
                serde_json::json!({"start":{"line":1,"column":0},"end":{"line":1,"column":26}})
            );
        });
    }
    #[test]
    fn emitted_unicode_prefix_uses_utf16_not_utf8_offsets() {
        GLOBALS.set(&Globals::new(), || {
            let (cm, program, role) = fixture("const prefix = '😀'; import React from 'react';");
            let (bytes, _) = emit(cm.clone(), &program);
            let owned = prepare_native_import_coverage(&program, &cm, vec![role]).unwrap();
            let result = emitted_native_import_coverage(&bytes, owned).unwrap();
            assert_eq!(
                result["roles"][0]["source"]["start"],
                serde_json::json!({"line":1,"column":21})
            );
            let text = std::str::from_utf8(&bytes).unwrap();
            assert_eq!(
                result["moduleEnd"],
                position(text, text.len(), false).unwrap()
            );
        });
    }
    #[test]
    fn rejects_stale_duplicate_and_changed_native_ownership() {
        GLOBALS.set(&Globals::new(), || {
            let (cm, mut program, role) = fixture("import React from 'react';");
            assert!(
                prepare_native_import_coverage(&program, &cm, vec![role.clone(), role.clone()])
                    .is_err()
            );
            {
                let Program::Module(module) = &mut program else {
                    unreachable!()
                };
                module.body.push(module.body[0].clone());
            }
            assert!(prepare_native_import_coverage(&program, &cm, vec![role.clone()]).is_err());
            let Program::Module(module) = &mut program else {
                unreachable!()
            };
            module.body.clear();
            assert!(prepare_native_import_coverage(&program, &cm, vec![role]).is_err());
        });
    }
    #[test]
    fn rejects_different_or_ambiguous_emitted_bytes() {
        GLOBALS.set(&Globals::new(), || {
            let (cm, program, role) = fixture("import React from 'react';");
            let owned = prepare_native_import_coverage(&program,&cm,vec![role]).unwrap();
            assert!(emitted_native_import_coverage(b"var nativeBinding = context.i('other');",owned.clone()).is_err());
            assert!(emitted_native_import_coverage(b"var nativeBinding = context.i('module'); var nativeBinding = context.i('module');",owned).is_err());
        });
    }
}
