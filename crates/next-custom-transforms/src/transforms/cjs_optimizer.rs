use rustc_hash::{FxHashMap, FxHashSet};
use serde::Deserialize;
use turbopack_binding::swc::core::{
    common::{util::take::Take, SyntaxContext, DUMMY_SP},
    ecma::{
        ast::{
            CallExpr, Callee, Decl, Expr, Id, Ident, Lit, MemberExpr, MemberProp, Module,
            ModuleItem, Pat, Script, Stmt, VarDecl, VarDeclKind, VarDeclarator,
        },
        atoms::{Atom, JsWord},
        utils::{prepend_stmts, private_ident, ExprFactory, IdentRenamer},
        visit::{noop_visit_mut_type, noop_visit_type, Visit, VisitMut, VisitMutWith, VisitWith},
    },
};

pub fn cjs_optimizer(config: Config, unresolved_ctxt: SyntaxContext) -> CjsOptimizer {
    CjsOptimizer {
        data: State::default(),
        packages: config.packages,
        unresolved_ctxt,
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    pub packages: FxHashMap<String, PackageConfig>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageConfig {
    pub transforms: FxHashMap<JsWord, JsWord>,
}

pub struct CjsOptimizer {
    data: State,
    packages: FxHashMap<String, PackageConfig>,
    unresolved_ctxt: SyntaxContext,
}

#[derive(Debug, Default)]
struct State {
    /// List of `require` calls **which should be replaced**.
    ///
    ///  `(identifier): (module_record)`
    imports: FxHashMap<Id, ImportRecord>,

    /// `(module_specifier, property): (identifier)`
    replaced: FxHashMap<(Atom, JsWord), Id>,

    extra_stmts: Vec<Stmt>,

    rename_map: FxHashMap<Id, Id>,

    /// Ignored identifiers for `obj` of [MemberExpr].
    ignored: FxHashSet<Id>,

    is_prepass: bool,
}

#[derive(Debug)]
struct ImportRecord {
    module_specifier: Atom,
}

impl CjsOptimizer {
    fn should_rewrite(&self, module_specifier: &str) -> Option<&FxHashMap<JsWord, JsWord>> {
        self.packages.get(module_specifier).map(|v| &v.transforms)
    }
}

impl VisitMut for CjsOptimizer {
    noop_visit_mut_type!();

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        self.data.is_prepass = true;
        stmts.visit_mut_children_with(self);
        self.data.is_prepass = false;
        stmts.visit_mut_children_with(self);
    }

    fn visit_mut_expr(&mut self, e: &mut Expr) {
        e.visit_mut_children_with(self);

        if let Expr::Member(n) = e {
            if let MemberProp::Ident(prop) = &n.prop {
                if let Expr::Ident(obj) = &*n.obj {
                    let key = obj.to_id();
                    if self.data.ignored.contains(&key) {
                        return;
                    }

                    if let Some(record) = self.data.imports.get(&key) {
                        let mut replaced = false;

                        let new_id = self
                            .data
                            .replaced
                            .entry((record.module_specifier.clone(), prop.sym.clone()))
                            .or_insert_with(|| private_ident!(prop.sym.clone()).to_id())
                            .clone();

                        if let Some(map) = self.should_rewrite(&record.module_specifier) {
                            if let Some(renamed) = map.get(&prop.sym) {
                                replaced = true;
                                if !self.data.is_prepass {
                                    // Transform as `require('foo').bar`
                                    let var = VarDeclarator {
                                        span: DUMMY_SP,
                                        name: Pat::Ident(new_id.clone().into()),
                                        init: Some(Box::new(Expr::Member(MemberExpr {
                                            span: DUMMY_SP,
                                            obj: Box::new(Expr::Call(CallExpr {
                                                span: DUMMY_SP,
                                                callee: Ident::new(
                                                    "require".into(),
                                                    DUMMY_SP.with_ctxt(self.unresolved_ctxt),
                                                )
                                                .as_callee(),
                                                args: vec![Expr::Lit(Lit::Str(
                                                    renamed.clone().into(),
                                                ))
                                                .as_arg()],
                                                type_args: None,
                                            })),
                                            prop: MemberProp::Ident(Ident::new(
                                                prop.sym.clone(),
                                                DUMMY_SP.with_ctxt(self.unresolved_ctxt),
                                            )),
                                        }))),
                                        definite: false,
                                    };

                                    if !self.data.extra_stmts.clone().into_iter().any(|s| {
                                        if let Stmt::Decl(Decl::Var(v)) = &s {
                                            v.decls.iter().any(|d| d.name == var.name)
                                        } else {
                                            false
                                        }
                                    }) {
                                        self.data.extra_stmts.push(Stmt::Decl(Decl::Var(
                                            Box::new(VarDecl {
                                                span: DUMMY_SP,
                                                kind: VarDeclKind::Const,
                                                declare: false,
                                                decls: vec![var],
                                            }),
                                        )));
                                    }

                                    *e = Expr::Ident(new_id.into());
                                }
                            }
                        }

                        if !replaced {
                            self.data.ignored.insert(key);
                        }
                    }
                }
            }
        }
    }

    fn visit_mut_module(&mut self, n: &mut Module) {
        n.visit_children_with(&mut Analyzer {
            data: &mut self.data,
            in_member_or_var: false,
        });

        n.visit_mut_children_with(self);

        prepend_stmts(
            &mut n.body,
            self.data.extra_stmts.drain(..).map(ModuleItem::Stmt),
        );

        n.visit_mut_children_with(&mut IdentRenamer::new(&self.data.rename_map));
    }

    fn visit_mut_script(&mut self, n: &mut Script) {
        n.visit_children_with(&mut Analyzer {
            data: &mut self.data,
            in_member_or_var: false,
        });

        n.visit_mut_children_with(self);

        prepend_stmts(&mut n.body, self.data.extra_stmts.drain(..));

        n.visit_mut_children_with(&mut IdentRenamer::new(&self.data.rename_map));
    }

    fn visit_mut_stmt(&mut self, n: &mut Stmt) {
        n.visit_mut_children_with(self);

        if let Stmt::Decl(Decl::Var(v)) = n {
            if v.decls.is_empty() {
                n.take();
            }
        }
    }

    fn visit_mut_var_declarator(&mut self, n: &mut VarDeclarator) {
        n.visit_mut_children_with(self);

        // Find `require('foo')`
        if let Some(Expr::Call(CallExpr {
            callee: Callee::Expr(callee),
            args,
            ..
        })) = n.init.as_deref()
        {
            if let Expr::Ident(ident) = &**callee {
                if ident.span.ctxt == self.unresolved_ctxt && ident.sym == *"require" {
                    if let Some(arg) = args.first() {
                        if let Expr::Lit(Lit::Str(v)) = &*arg.expr {
                            // TODO: Config

                            if let Pat::Ident(name) = &n.name {
                                if self.should_rewrite(&v.value).is_some() {
                                    let key = name.to_id();

                                    if !self.data.is_prepass {
                                        if !self.data.ignored.contains(&key) {
                                            // Drop variable declarator.
                                            n.name.take();
                                        }
                                    } else {
                                        self.data.imports.insert(
                                            key,
                                            ImportRecord {
                                                module_specifier: v.value.clone(),
                                            },
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fn visit_mut_var_declarators(&mut self, n: &mut Vec<VarDeclarator>) {
        n.visit_mut_children_with(self);

        // We make `name` invalid if we should drop it.
        n.retain(|v| !v.name.is_invalid());
    }
}

struct Analyzer<'a> {
    in_member_or_var: bool,
    data: &'a mut State,
}

impl Visit for Analyzer<'_> {
    noop_visit_type!();

    fn visit_var_declarator(&mut self, n: &VarDeclarator) {
        let mut safe_to_ignore = false;

        // Ignore the require itself (foo = require('foo'))
        if let Some(Expr::Call(CallExpr {
            callee: Callee::Expr(callee),
            ..
        })) = n.init.as_deref()
        {
            if let Expr::Ident(ident) = &**callee {
                if ident.sym == *"require" {
                    safe_to_ignore = true;
                }
            }
        }

        if safe_to_ignore {
            self.in_member_or_var = true;
            n.visit_children_with(self);
            self.in_member_or_var = false;
        } else {
            n.visit_children_with(self);
        }
    }

    fn visit_member_expr(&mut self, e: &MemberExpr) {
        self.in_member_or_var = true;
        e.visit_children_with(self);
        self.in_member_or_var = false;

        if let (Expr::Ident(obj), MemberProp::Computed(..)) = (&*e.obj, &e.prop) {
            self.data.ignored.insert(obj.to_id());
        }
    }

    fn visit_ident(&mut self, i: &Ident) {
        i.visit_children_with(self);
        if !self.in_member_or_var {
            self.data.ignored.insert(i.to_id());
        }
    }
}
