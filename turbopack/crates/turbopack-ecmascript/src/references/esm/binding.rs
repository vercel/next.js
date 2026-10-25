use anyhow::Result;
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use swc_core::{
    common::{DUMMY_SP, Spanned},
    ecma::{
        ast::{
            BindingIdent, BlockStmt, Callee, Decl, EmptyStmt, Expr, Ident, KeyValueProp, Pat, Prop,
            PropName, SimpleAssignTarget, Stmt, VarDecl, VarDeclKind, VarDeclarator,
        },
        visit::{
            AstParentKind, Visit, VisitWith,
            fields::{CallExprField, CalleeField, ExprField, ExprStmtField, PropField, StmtField},
        },
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, Vc};
use turbopack_core::{
    chunk::{ChunkingContext, MinifyType},
    source::Source,
};

use crate::{
    ScopeHoistingContext,
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::CodeGeneration,
    create_visitor,
    references::esm::{
        EsmAssetReference,
        base::{ReferencedAsset, ReferencedAssetIdent},
    },
};

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode, Hash)]
struct EsmBinding {
    export: Option<RcStr>,
    ast_path: AstPathId,
    keep_this: bool,
}

#[derive(Default, Clone, Debug)]
pub struct EsmBindingsBuilder {
    bindings: FxIndexMap<ResolvedVc<EsmAssetReference>, Vec<EsmBinding>>,
}

#[derive(Default, Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode, Hash)]
pub struct EsmBindings {
    #[allow(clippy::type_complexity)]
    bindings: Box<[(ResolvedVc<EsmAssetReference>, Box<[EsmBinding]>)]>,
}

impl EsmBindingsBuilder {
    pub fn add(
        &mut self,
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPathId,
    ) {
        self.bindings
            .entry(reference)
            .or_default()
            .push(EsmBinding {
                export,
                ast_path,
                keep_this: false,
            });
    }

    /// Where possible, bind the namespace to `this` when the named import is called.
    pub fn add_keep_this(
        &mut self,
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPathId,
    ) {
        self.bindings
            .entry(reference)
            .or_default()
            .push(EsmBinding {
                export,
                ast_path,
                keep_this: true,
            });
    }

    pub fn build(self) -> Option<EsmBindings> {
        if self.bindings.is_empty() {
            return None;
        }

        Some(EsmBindings {
            bindings: self
                .bindings
                .into_iter()
                .map(|(k, v)| (k, v.into_boxed_slice()))
                .collect(),
        })
    }
}

fn direct_call_statement(trie: &AstPathTrie, mut path: AstPathId) -> Option<AstPathId> {
    for expected in [
        AstParentKind::CallExpr(CallExprField::Callee),
        AstParentKind::Expr(ExprField::Call),
        AstParentKind::ExprStmt(ExprStmtField::Expr),
        AstParentKind::Stmt(StmtField::Expr),
    ] {
        path = trie.parent_or_root(path);
        if trie.get(path) != Some(expected) {
            return None;
        }
    }
    Some(trie.parent_or_root(path))
}

// A direct eval in an argument or deferred callback could observe the new lexical binding.
// Conservatively retain the existing callee for every argument containing an eval identifier.
#[derive(Default)]
struct ContainsEvalIdent(bool);

impl Visit for ContainsEvalIdent {
    fn visit_ident(&mut self, ident: &Ident) {
        self.0 |= ident.sym == "eval";
    }
}

fn preserve_call_statement(stmt: &mut Stmt, imported: &ReferencedAssetIdent) {
    let Stmt::Expr(statement) = stmt else { return };
    let Expr::Call(call) = &mut *statement.expr else {
        return;
    };
    let mut contains_eval = ContainsEvalIdent::default();
    call.args.visit_with(&mut contains_eval);
    let Callee::Expr(callee) = &mut call.callee else {
        return;
    };
    let span = callee.span();
    if contains_eval.0 {
        *callee = Box::new(imported.as_expr(span, true));
        return;
    }
    // This modifier runs under the actual consumed parse result's GLOBALS.
    let private = Ident::new_private("__next_test_declaration__".into(), DUMMY_SP);
    let value = imported.as_expr(span, false);
    *callee = Box::new(Ident::new(private.sym.clone(), span, private.ctxt).into());
    let binding = Stmt::Decl(Decl::Var(Box::new(VarDecl {
        span: DUMMY_SP,
        ctxt: Default::default(),
        kind: VarDeclKind::Const,
        declare: false,
        decls: vec![VarDeclarator {
            span: DUMMY_SP,
            name: Pat::Ident(BindingIdent {
                id: private,
                type_ann: None,
            }),
            init: Some(Box::new(value)),
            definite: false,
        }],
    })));
    let span = stmt.span();
    let original = std::mem::replace(stmt, Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
    *stmt = Stmt::Block(BlockStmt {
        span,
        ctxt: Default::default(),
        stmts: vec![binding, original],
    });
}

fn preserve_call_statement_with_maps(
    stmt: &mut Stmt,
    imported: &ReferencedAssetIdent,
    captured: &crate::test_declaration_source_map::CapturedCalls,
) {
    preserve_call_statement(stmt, imported);
    // This runs only in the actual resolved adapter modifier. An eval fallback
    // remains an expression statement and does not issue a mapping role.
    let Stmt::Block(block) = stmt else { return };
    let Some(Stmt::Expr(statement)) = block.stmts.last() else {
        return;
    };
    let Expr::Call(call) = &*statement.expr else {
        return;
    };
    let Callee::Expr(callee) = &call.callee else {
        return;
    };
    let Expr::Ident(ident) = &**callee else {
        return;
    };
    captured
        .lock()
        .expect("test declaration mapping capture")
        .push(crate::test_declaration_source_map::OwnedCall {
            call: call.span,
            callee: ident.span,
        });
}

impl EsmBindings {
    pub async fn code_generation(
        &self,
        trie: &AstPathTrie,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
        expected_adapter: Option<ResolvedVc<Box<dyn Source>>>,
    ) -> Result<CodeGeneration> {
        let mut visitors = vec![];
        let mut test_declaration_calls: Option<crate::test_declaration_source_map::CapturedCalls> =
            None;

        let unused_references = chunking_context.unused_references();
        let unminified = expected_adapter.is_some()
            && matches!(*chunking_context.minify_type().await?, MinifyType::NoMinify);

        for (reference, bindings) in &self.bindings {
            if unused_references
                .contains_key(&ResolvedVc::upcast(*reference))
                .await?
            {
                continue;
            }
            let imported_module = reference.get_referenced_asset().await?;
            let actual_adapter = if let (ReferencedAsset::Some(asset), Some(expected)) =
                (&imported_module, expected_adapter)
            {
                if let Some(actual) =
                    ResolvedVc::try_downcast_type::<crate::EcmascriptModuleAsset>(*asset)
                {
                    actual.await?.source == expected
                } else {
                    false
                }
            } else {
                false
            };

            let mut exports_cache: FxHashMap<Option<RcStr>, _> = FxHashMap::default();
            #[derive(Clone)]
            enum ImportedIdent {
                Module(ReferencedAssetIdent),
                None,
                /// Empty module (alias set to `false`): namespace imports resolve to `{}`.
                Empty,
                Unresolvable,
            }
            for EsmBinding {
                export,
                ast_path,
                keep_this,
            } in bindings
            {
                let imported_ident = match &imported_module {
                    ReferencedAsset::None => ImportedIdent::None,
                    ReferencedAsset::Empty => {
                        if export.is_some() {
                            // Named/default binding from an empty module → `undefined`
                            ImportedIdent::None
                        } else {
                            // Namespace import from an empty module → `{}`
                            ImportedIdent::Empty
                        }
                    }
                    imported_module => match exports_cache.entry(export.clone()) {
                        std::collections::hash_map::Entry::Vacant(entry) => {
                            let ident: ImportedIdent = imported_module
                                .get_ident(chunking_context, export.clone(), scope_hoisting_context)
                                .await?
                                .map_or(ImportedIdent::Unresolvable, ImportedIdent::Module);
                            entry.insert(ident.clone());
                            ident
                        }
                        std::collections::hash_map::Entry::Occupied(entry) => entry.get().clone(),
                    },
                };

                // Walk up from the binding towards the root, stopping at the innermost node kind we
                // know how to rewrite.
                let mut ast_path = *ast_path;
                loop {
                    match trie.get(ast_path) {
                        // Shorthand properties get special treatment because we need to rewrite
                        // them to normal key-value pairs.
                        Some(swc_core::ecma::visit::AstParentKind::Prop(PropField::Shorthand)) => {
                            ast_path = trie.parent_or_root(ast_path);
                            visitors.push(create_visitor!(
                                exact,
                                trie,
                                ast_path,
                                visit_mut_prop,
                                |prop: &mut Prop| {
                                    if let Prop::Shorthand(ident) = prop {
                                        match &imported_ident {
                                            ImportedIdent::Module(imported_ident) => {
                                                *prop = Prop::KeyValue(KeyValueProp {
                                                    key: PropName::Ident(ident.clone().into()),
                                                    value: Box::new(
                                                        imported_ident.as_expr(ident.span, false),
                                                    ),
                                                });
                                            }
                                            ImportedIdent::None => {
                                                *prop = Prop::KeyValue(KeyValueProp {
                                                    key: PropName::Ident(ident.clone().into()),
                                                    value: Expr::undefined(ident.span),
                                                });
                                            }
                                            ImportedIdent::Empty => {
                                                use swc_core::quote;
                                                *prop = Prop::KeyValue(KeyValueProp {
                                                    key: PropName::Ident(ident.clone().into()),
                                                    value: Box::new(quote!("{}" as Expr)),
                                                });
                                            }
                                            ImportedIdent::Unresolvable => {
                                                // Do nothing, the reference will insert a throw
                                            }
                                        }
                                    }
                                }
                            ));
                            break;
                        }
                        // Any other expression can be replaced with the import accessor.
                        Some(swc_core::ecma::visit::AstParentKind::Expr(_)) => {
                            ast_path = trie.parent_or_root(ast_path);
                            let in_call = !keep_this
                                && matches!(
                                    trie.get(ast_path),
                                    Some(swc_core::ecma::visit::AstParentKind::Callee(
                                        CalleeField::Expr
                                    ))
                                );

                            if unminified
                                && actual_adapter
                                && in_call
                                && matches!(
                                    export.as_deref(),
                                    Some("test" | "it" | "describe" | "suite")
                                )
                                && let ImportedIdent::Module(
                                    imported @ ReferencedAssetIdent::Module {
                                        export: Some(_), ..
                                    },
                                ) = &imported_ident
                                && let Some(statement_path) = direct_call_statement(trie, ast_path)
                            {
                                let imported = imported.clone();
                                let captured = test_declaration_calls
                                    .get_or_insert_with(Default::default)
                                    .clone();
                                visitors.push(create_visitor!(
                                    exact,
                                    trie,
                                    statement_path,
                                    visit_mut_stmt,
                                    |stmt: &mut Stmt| {
                                        preserve_call_statement_with_maps(
                                            stmt, &imported, &captured,
                                        )
                                    }
                                ));
                                break;
                            }

                            visitors.push(create_visitor!(
                                exact,
                                trie,
                                ast_path,
                                visit_mut_expr,
                                |expr: &mut Expr| {
                                    use swc_core::common::Spanned;
                                    match &imported_ident {
                                        ImportedIdent::Module(imported_ident) => {
                                            *expr = imported_ident.as_expr(expr.span(), in_call);
                                        }
                                        ImportedIdent::None => {
                                            *expr = *Expr::undefined(expr.span());
                                        }
                                        ImportedIdent::Empty => {
                                            use swc_core::quote;
                                            *expr = quote!("{}" as Expr);
                                        }
                                        ImportedIdent::Unresolvable => {
                                            // Do nothing, the reference will insert a throw
                                        }
                                    }
                                }
                            ));
                            break;
                        }
                        // We need to handle LHS because of code like
                        // (function (RouteKind1){})(RouteKind || RouteKind = {})
                        Some(swc_core::ecma::visit::AstParentKind::SimpleAssignTarget(_)) => {
                            ast_path = trie.parent_or_root(ast_path);

                            visitors.push(create_visitor!(
                                exact,
                                trie,
                                ast_path,
                                visit_mut_simple_assign_target,
                                |l: &mut SimpleAssignTarget| {
                                    use swc_core::common::Spanned;
                                    match &imported_ident {
                                        ImportedIdent::Module(imported_ident) => {
                                            *l = imported_ident
                                                .as_expr_individual(l.span())
                                                .map_either(
                                                    |i| SimpleAssignTarget::Ident(i.into()),
                                                    SimpleAssignTarget::Member,
                                                )
                                                .into_inner();
                                        }
                                        ImportedIdent::None | ImportedIdent::Empty => {
                                            // Do nothing, cannot assign to `undefined` or `{}`
                                        }
                                        ImportedIdent::Unresolvable => {
                                            // Do nothing, the reference will insert a throw
                                        }
                                    }
                                }
                            ));
                            break;
                        }
                        Some(_) => {
                            ast_path = trie.parent_or_root(ast_path);
                        }
                        None => break,
                    }
                }
            }
        }

        let mut result = CodeGeneration::visitors(visitors);
        result.test_declaration_calls = test_declaration_calls;
        Ok(result)
    }
}

#[cfg(test)]
mod declaration_call_tests {
    use std::{process::Command, sync::Arc};

    use swc_core::{
        common::{FileName, Mark, SourceFile, SourceMap, Spanned, SyntaxContext, errors::HANDLER},
        ecma::{
            ast::*,
            codegen::{Emitter, text_writer::JsWriter},
            parser::parse_file_as_module,
            transforms::base::{hygiene::hygiene, resolver},
            visit::{VisitMut, VisitMutWith, fields::*},
        },
        testing::run_test,
    };
    use turbopack_core::resolve::ExternalType;

    use super::{direct_call_statement, preserve_call_statement};
    use crate::{
        ast_path_trie::AstPathTrieBuilder,
        references::esm::base::{ImportSource, ReferencedAssetIdent},
    };

    fn imported() -> ReferencedAssetIdent {
        ReferencedAssetIdent::Module {
            namespace_ident: "__namespace".into(),
            ctxt: None,
            export: Some("test".into()),
            import_source: ImportSource::External {
                request: "vitest".into(),
                ty: ExternalType::CommonJs,
            },
        }
    }

    fn parse(fm: &SourceFile) -> Module {
        let mut module = parse_file_as_module(
            fm,
            Default::default(),
            EsVersion::latest(),
            None,
            &mut vec![],
        )
        .map_err(|error| HANDLER.with(|handler| error.into_diagnostic(handler).emit()))
        .unwrap();
        module.visit_mut_with(&mut resolver(Mark::new(), Mark::new(), false));
        module
    }

    struct Preserve;
    impl VisitMut for Preserve {
        fn visit_mut_stmt(&mut self, stmt: &mut Stmt) {
            stmt.visit_mut_children_with(self);
            if matches!(stmt, Stmt::Expr(statement) if matches!(&*statement.expr,
                Expr::Call(call) if matches!(&call.callee, Callee::Expr(callee) if matches!(&**callee, Expr::Ident(id) if id.sym == "test"))))
            {
                preserve_call_statement(stmt, &imported());
            }
        }
    }

    fn emit(module: &mut Module, cm: &Arc<SourceMap>) -> String {
        module.visit_mut_with(&mut hygiene());
        module.visit_mut_with(&mut swc_core::ecma::transforms::base::fixer::fixer(None));
        let mut bytes = Vec::new();
        let mut emitter = Emitter {
            cfg: swc_core::ecma::codegen::Config::default(),
            cm: cm.clone(),
            comments: None,
            wr: JsWriter::new(cm.clone(), "\n", &mut bytes, None),
        };
        emitter.emit_module(module).unwrap();
        String::from_utf8(bytes).unwrap()
    }

    fn execute(source: &str, before: &str, after: &str, expected: &str) {
        run_test(false, |cm, _| {
            let fm = cm.new_source_file(FileName::Anon.into(), source.to_owned());
            let mut module = parse(&fm);
            module.visit_mut_with(&mut Preserve);
            let code = format!(
                "'use strict';{before};\n{}\n{after}",
                emit(&mut module, &cm)
            );
            let output = Command::new("node")
                .args(["-e", &code])
                .output()
                .expect("Node executes generated test call AST");
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            assert_eq!(String::from_utf8(output.stdout).unwrap().trim(), expected);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn statement_path_rejects_return_arguments_and_non_call_expressions() {
        use swc_core::ecma::visit::AstParentKind;
        let prefix = [
            AstParentKind::Module(ModuleField::Body(0)),
            AstParentKind::ModuleItem(ModuleItemField::Stmt),
        ];
        let call = [
            AstParentKind::Stmt(StmtField::Expr),
            AstParentKind::ExprStmt(ExprStmtField::Expr),
            AstParentKind::Expr(ExprField::Call),
            AstParentKind::CallExpr(CallExprField::Callee),
            AstParentKind::Callee(CalleeField::Expr),
        ];
        let mut builder = AstPathTrieBuilder::new();
        let statement = builder.intern(prefix);
        let callee = builder.intern(prefix.into_iter().chain(call));
        let trie = builder.build();
        assert_eq!(direct_call_statement(&trie, callee), Some(statement));
        let mut builder = AstPathTrieBuilder::new();
        let returned = builder.intern(prefix.into_iter().chain([
            AstParentKind::Stmt(StmtField::Return),
            AstParentKind::ReturnStmt(ReturnStmtField::Arg),
            AstParentKind::Expr(ExprField::Call),
            AstParentKind::CallExpr(CallExprField::Callee),
            AstParentKind::Callee(CalleeField::Expr),
        ]));
        let trie = builder.build();
        assert_eq!(direct_call_statement(&trie, returned), None);
        for middle in [
            vec![
                AstParentKind::Expr(ExprField::Await),
                AstParentKind::AwaitExpr(AwaitExprField::Arg),
            ],
            vec![
                AstParentKind::Expr(ExprField::Call),
                AstParentKind::CallExpr(CallExprField::Args(0)),
                AstParentKind::ExprOrSpread(ExprOrSpreadField::Expr),
            ],
        ] {
            let mut builder = AstPathTrieBuilder::new();
            let path = builder.intern(
                prefix
                    .into_iter()
                    .chain([
                        AstParentKind::Stmt(StmtField::Expr),
                        AstParentKind::ExprStmt(ExprStmtField::Expr),
                    ])
                    .chain(middle)
                    .chain([
                        AstParentKind::Expr(ExprField::Call),
                        AstParentKind::CallExpr(CallExprField::Callee),
                        AstParentKind::Callee(CalleeField::Expr),
                    ]),
            );
            let trie = builder.build();
            assert_eq!(direct_call_statement(&trie, path), None);
        }
    }

    #[test]
    fn actual_ast_retains_callee_span_arguments_and_private_identity() {
        run_test(false, |cm, _| {
            let fm = cm.new_source_file(FileName::Anon.into(), "test(argument());");
            let mut module = parse(&fm);
            let ModuleItem::Stmt(stmt) = &mut module.body[0] else {
                panic!("statement")
            };
            let Stmt::Expr(statement) = &*stmt else {
                panic!("call statement")
            };
            let Expr::Call(original) = &*statement.expr else {
                panic!("call")
            };
            let original_args = original.args.clone();
            let Callee::Expr(callee) = &original.callee else {
                panic!("callee")
            };
            let span = callee.span();
            preserve_call_statement(stmt, &imported());
            let Stmt::Block(block) = stmt else {
                panic!("private block")
            };
            assert_eq!(block.stmts.len(), 2);
            let Stmt::Decl(Decl::Var(var)) = &block.stmts[0] else {
                panic!("private binding")
            };
            let Pat::Ident(binding) = &var.decls[0].name else {
                panic!("private identity")
            };
            assert_ne!(binding.id.ctxt, SyntaxContext::empty());
            let Stmt::Expr(statement) = &block.stmts[1] else {
                panic!("original call")
            };
            let Expr::Call(call) = &*statement.expr else {
                panic!("original call")
            };
            let Callee::Expr(callee) = &call.callee else {
                panic!("private callee")
            };
            let Expr::Ident(id) = &**callee else {
                panic!("IdentifierCall")
            };
            assert_eq!(id.to_id(), binding.id.to_id());
            assert_eq!(id.span, span);
            assert_eq!(call.args, original_args);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn generated_call_reads_live_getter_once_before_arguments_and_keeps_undefined_this() {
        execute(
            "test(argument()); test('next');",
            "const trace=[];let version='a';const \
             __namespace=Object.create(null,{test:{get(){const \
             selected=version;trace.push('get:'+selected);return \
             function(value){trace.push('call:'+selected+':'+value+':'+(this===undefined))}}}});\
             function argument(){trace.push('arg');version='b';return 'first'}",
            "console.log(JSON.stringify(trace))",
            r#"["get:a","arg","call:a:first:true","get:b","call:b:next:true"]"#,
        );
    }

    #[test]
    fn generated_call_keeps_getter_and_cycle_tdz_error_identity_without_eager_reads() {
        execute(
            "before();try{test(argument())}catch(error){trace.push(error===owned)}",
            "const trace=[];const owned=new ReferenceError('owned uninitialized export');const \
             __namespace=Object.create(null,{test:{get(){trace.push('get');throw \
             owned}}});function before(){trace.push('before')}function \
             argument(){trace.push('arg')}",
            "console.log(JSON.stringify(trace))",
            r#"["before","get",true]"#,
        );
    }

    #[test]
    fn argument_eval_and_deferred_callback_eval_keep_original_lexical_environment() {
        execute(
            "test(eval('typeof __next_test_declaration__'));test(()=>eval('typeof \
             __next_test_declaration__'))",
            "const trace=[];const __namespace={test(value){trace.push([typeof \
             value==='function'?value():value,this===undefined])}};Object.\
             defineProperty(__namespace,'test',{value:__namespace.test})",
            "console.log(JSON.stringify(trace))",
            r#"[["undefined",true],["undefined",true]]"#,
        );
    }

    #[test]
    fn generated_call_keeps_actual_callee_across_await_argument_and_private_name_collision() {
        execute(
            "const __next_test_declaration__='authored';async function run(){test(await \
             argument());test(__next_test_declaration__)}run().then(()=>console.log(JSON.\
             stringify(trace)))",
            "const trace=[];let version='a';const \
             __namespace=Object.create(null,{test:{get(){const \
             selected=version;trace.push('get:'+selected);return \
             function(value){trace.push('call:'+selected+':'+value+':'+(this===undefined))}}}});\
             function argument(){trace.push('arg');return \
             Promise.resolve().then(()=>{version='b';trace.push('settle');return 'value'})}",
            "",
            r#"["get:a","arg","settle","call:a:value:true","get:b","call:b:authored:true"]"#,
        );
    }

    #[test]
    fn actual_adapter_modifier_retains_terminal_maps_without_changing_emitted_bytes() {
        use crate::test_declaration_source_map::{
            CallParenWriter, CapturedCalls, prepare_call_mappings,
        };

        run_test(false, |cm, _| {
            for source in [
                "test('a')",
                "test /* ( skipped */ ('a')",
                "test\n('a')",
                "test // ( skipped\n('a')",
                "test /* multiline\n */ ('a')",
                "   test /* 🎈 */  ('a')",
            ] {
                let fm = cm.new_source_file(
                    FileName::Custom("adapter-trivia.mjs".into()).into(),
                    source.to_owned(),
                );
                let mut module = parse(&fm);
                let ModuleItem::Stmt(statement) = &mut module.body[0] else {
                    panic!("statement")
                };
                let captured: CapturedCalls = Default::default();
                super::preserve_call_statement_with_maps(statement, &imported(), &captured);
                let sites = captured.lock().unwrap().clone();
                assert_eq!(sites.len(), 1);
                module.visit_mut_with(&mut hygiene());
                module.visit_mut_with(&mut swc_core::ecma::transforms::base::fixer::fixer(None));
                let program = Program::Module(module);
                let mappings = prepare_call_mappings(&program, &cm, &sites);
                assert_eq!(mappings.values().map(Vec::len).sum::<usize>(), 1);
                let mut baseline = Vec::new();
                let mut old_maps = Vec::new();
                Emitter {
                    cfg: Default::default(),
                    cm: cm.clone(),
                    comments: None,
                    wr: JsWriter::new(cm.clone(), "\n", &mut baseline, Some(&mut old_maps)),
                }
                .emit_program(&program)
                .unwrap();
                let mut emitted = Vec::new();
                let mut actual_maps = Vec::new();
                Emitter {
                    cfg: Default::default(),
                    cm: cm.clone(),
                    comments: None,
                    wr: CallParenWriter::new(
                        JsWriter::new(cm.clone(), "\n", &mut emitted, Some(&mut actual_maps)),
                        mappings,
                    ),
                }
                .emit_program(&program)
                .unwrap();
                assert_eq!(emitted, baseline);
                let original =
                    crate::test_declaration_source_map::argument_open(&cm, sites[0]).unwrap();
                assert_eq!(
                    source.as_bytes()[(original.0 - fm.start_pos.0) as usize],
                    b'('
                );
                let emitted_text = std::str::from_utf8(&emitted).unwrap();
                let additions = actual_maps
                    .iter()
                    .enumerate()
                    .filter_map(|(index, (pos, generated))| {
                        let line = emitted_text.lines().nth(generated.line as usize)?;
                        (*pos == original
                            && line.as_bytes().get(generated.col as usize) == Some(&b'('))
                        .then_some(index)
                    })
                    .collect::<Vec<_>>();
                assert_eq!(additions.len(), 1);
                let added = additions[0];
                let (_, generated) = actual_maps.remove(added);
                let line = std::str::from_utf8(&emitted)
                    .unwrap()
                    .lines()
                    .nth(generated.line as usize)
                    .unwrap();
                assert_eq!(line.as_bytes()[generated.col as usize], b'(');
                assert_eq!(actual_maps, old_maps);
            }
            let fm = cm.new_source_file(
                FileName::Custom("eval-fallback.mjs".into()).into(),
                "test(eval('1'))".to_owned(),
            );
            let mut module = parse(&fm);
            let ModuleItem::Stmt(statement) = &mut module.body[0] else {
                panic!("statement")
            };
            let captured: CapturedCalls = Default::default();
            super::preserve_call_statement_with_maps(statement, &imported(), &captured);
            assert!(captured.lock().unwrap().is_empty());
            Ok(())
        })
        .unwrap();
    }
}
