use std::{
    cell::RefCell,
    collections::{hash_map, BTreeMap},
    convert::{TryFrom, TryInto},
    mem::{replace, take},
    rc::Rc,
};

use hex::encode as hex_encode;
use indoc::formatdoc;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Deserialize;
use sha1::{Digest, Sha1};
use swc_core::{
    atoms::Atom,
    common::{
        comments::{Comment, CommentKind, Comments},
        errors::HANDLER,
        util::take::Take,
        BytePos, FileName, Mark, Span, SyntaxContext, DUMMY_SP,
    },
    ecma::{
        ast::*,
        utils::{private_ident, quote_ident, ExprFactory},
        visit::{noop_visit_mut_type, visit_mut_pass, VisitMut, VisitMutWith},
    },
};
use turbo_rcstr::RcStr;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {
    pub is_react_server_layer: bool,
    pub use_cache_enabled: bool,
    pub hash_salt: String,
    pub cache_kinds: FxHashSet<RcStr>,
}

#[derive(Clone, Debug)]
enum Directive {
    UseServer,
    UseCache { cache_kind: RcStr },
}

#[derive(Clone, Debug)]
enum DirectiveLocation {
    Module,
    FunctionBody,
}

#[derive(Clone, Debug)]
enum ThisStatus {
    Allowed,
    Forbidden { directive: Directive },
}

#[derive(Clone, Debug)]
enum ServerActionsErrorKind {
    ExportedSyncFunction {
        span: Span,
        in_action_file: bool,
    },
    ForbiddenExpression {
        span: Span,
        expr: String,
        directive: Directive,
    },
    InlineSyncFunction {
        span: Span,
        directive: Directive,
    },
    InlineUseCacheInClassInstanceMethod {
        span: Span,
    },
    InlineUseCacheInClientComponent {
        span: Span,
    },
    InlineUseServerInClassInstanceMethod {
        span: Span,
    },
    InlineUseServerInClientComponent {
        span: Span,
    },
    MisplacedDirective {
        span: Span,
        directive: String,
        location: DirectiveLocation,
    },
    MisplacedWrappedDirective {
        span: Span,
        directive: String,
        location: DirectiveLocation,
    },
    MisspelledDirective {
        span: Span,
        directive: String,
        expected_directive: String,
    },
    MultipleDirectives {
        span: Span,
        location: DirectiveLocation,
    },
    UnknownCacheKind {
        span: Span,
        cache_kind: RcStr,
    },
    UseCacheWithoutExperimentalFlag {
        span: Span,
        directive: String,
    },
    WrappedDirective {
        span: Span,
        directive: String,
    },
}

/// A mapping of hashed action id to the action's exported function name.
// Using BTreeMap to ensure the order of the actions is deterministic.
pub type ActionsMap = BTreeMap<Atom, Atom>;

#[tracing::instrument(level = tracing::Level::TRACE, skip_all)]
pub fn server_actions<C: Comments>(
    file_name: &FileName,
    config: Config,
    comments: C,
    use_cache_telemetry_tracker: Rc<RefCell<FxHashMap<String, usize>>>,
) -> impl Pass {
    visit_mut_pass(ServerActions {
        config,
        comments,
        file_name: file_name.to_string(),
        start_pos: BytePos(0),
        file_directive: None,
        in_exported_expr: false,
        in_default_export_decl: false,
        fn_decl_ident: None,
        in_callee: false,
        has_action: false,
        has_cache: false,
        this_status: ThisStatus::Allowed,

        reference_index: 0,
        in_module_level: true,
        should_track_names: false,

        names: Default::default(),
        declared_idents: Default::default(),

        exported_idents: Default::default(),

        // This flag allows us to rewrite `function foo() {}` to `const foo = createProxy(...)`.
        rewrite_fn_decl_to_proxy_decl: None,
        rewrite_default_fn_expr_to_proxy_expr: None,
        rewrite_expr_to_proxy_expr: None,

        annotations: Default::default(),
        extra_items: Default::default(),
        hoisted_extra_items: Default::default(),
        export_actions: Default::default(),

        private_ctxt: SyntaxContext::empty().apply_mark(Mark::new()),

        arrow_or_fn_expr_ident: None,
        exported_local_ids: FxHashSet::default(),

        use_cache_telemetry_tracker,
    })
}

/// Serializes the Server Actions into a magic comment prefixed by
/// `__next_internal_action_entry_do_not_use__`.
fn generate_server_actions_comment(actions: ActionsMap) -> String {
    format!(
        " __next_internal_action_entry_do_not_use__ {} ",
        serde_json::to_string(&actions).unwrap()
    )
}

struct ServerActions<C: Comments> {
    #[allow(unused)]
    config: Config,
    file_name: String,
    comments: C,

    start_pos: BytePos,
    file_directive: Option<Directive>,
    in_exported_expr: bool,
    in_default_export_decl: bool,
    fn_decl_ident: Option<Ident>,
    in_callee: bool,
    has_action: bool,
    has_cache: bool,
    this_status: ThisStatus,

    reference_index: u32,
    in_module_level: bool,
    should_track_names: bool,

    names: Vec<Name>,
    declared_idents: Vec<Ident>,

    // This flag allows us to rewrite `function foo() {}` to `const foo = createProxy(...)`.
    rewrite_fn_decl_to_proxy_decl: Option<VarDecl>,
    rewrite_default_fn_expr_to_proxy_expr: Option<Box<Expr>>,
    rewrite_expr_to_proxy_expr: Option<Box<Expr>>,

    exported_idents: Vec<(
        /* ident */ Ident,
        /* name */ Atom,
        /* id */ Atom,
    )>,

    annotations: Vec<Stmt>,
    extra_items: Vec<ModuleItem>,
    hoisted_extra_items: Vec<ModuleItem>,
    export_actions: Vec<(/* name */ Atom, /* id */ Atom)>,

    private_ctxt: SyntaxContext,

    arrow_or_fn_expr_ident: Option<Ident>,
    exported_local_ids: FxHashSet<Id>,

    use_cache_telemetry_tracker: Rc<RefCell<FxHashMap<String, usize>>>,
}

impl<C: Comments> ServerActions<C> {
    fn generate_server_reference_id(
        &self,
        export_name: &str,
        is_cache: bool,
        params: Option<&Vec<Param>>,
    ) -> Atom {
        // Attach a checksum to the action using sha1:
        // $$id = special_byte + sha1('hash_salt' + 'file_name' + ':' + 'export_name');
        // Currently encoded as hex.

        let mut hasher = Sha1::new();
        hasher.update(self.config.hash_salt.as_bytes());
        hasher.update(self.file_name.as_bytes());
        hasher.update(b":");
        hasher.update(export_name.as_bytes());
        let mut result = hasher.finalize().to_vec();

        // Prepend an extra byte to the ID, with the following format:
        // 0     000000    0
        // ^type ^arg mask ^rest args
        //
        // The type bit represents if the action is a cache function or not.
        // For cache functions, the type bit is set to 1. Otherwise, it's 0.
        //
        // The arg mask bit is used to determine which arguments are used by
        // the function itself, up to 6 arguments. The bit is set to 1 if the
        // argument is used, or being spread or destructured (so it can be
        // indirectly or partially used). The bit is set to 0 otherwise.
        //
        // The rest args bit is used to determine if there's a ...rest argument
        // in the function signature. If there is, the bit is set to 1.
        //
        //  For example:
        //
        //   async function foo(a, foo, b, bar, ...baz) {
        //     'use cache';
        //     return a + b;
        //   }
        //
        // will have it encoded as [1][101011][1]. The first bit is set to 1
        // because it's a cache function. The second part has 1010 because the
        // only arguments used are `a` and `b`. The subsequent 11 bits are set
        // to 1 because there's a ...rest argument starting from the 5th. The
        // last bit is set to 1 as well for the same reason.
        let type_bit = if is_cache { 1u8 } else { 0u8 };
        let mut arg_mask = 0u8;
        let mut rest_args = 0u8;

        if let Some(params) = params {
            // TODO: For the current implementation, we don't track if an
            // argument ident is actually referenced in the function body.
            // Instead, we go with the easy route and assume defined ones are
            // used. This can be improved in the future.
            for (i, param) in params.iter().enumerate() {
                if let Pat::Rest(_) = param.pat {
                    // If there's a ...rest argument, we set the rest args bit
                    // to 1 and set the arg mask to 0b111111.
                    arg_mask = 0b111111;
                    rest_args = 0b1;
                    break;
                }
                if i < 6 {
                    arg_mask |= 0b1 << (5 - i);
                } else {
                    // More than 6 arguments, we set the rest args bit to 1.
                    // This is rare for a Server Action, usually.
                    rest_args = 0b1;
                    break;
                }
            }
        } else {
            // If we can't determine the arguments (e.g. not staticaly analyzable),
            // we assume all arguments are used.
            arg_mask = 0b111111;
            rest_args = 0b1;
        }

        result.push((type_bit << 7) | (arg_mask << 1) | rest_args);
        result.rotate_right(1);

        Atom::from(hex_encode(result))
    }

    fn gen_action_ident(&mut self) -> Atom {
        let id: Atom = format!("$$RSC_SERVER_ACTION_{0}", self.reference_index).into();
        self.reference_index += 1;
        id
    }

    fn gen_cache_ident(&mut self) -> Atom {
        let id: Atom = format!("$$RSC_SERVER_CACHE_{0}", self.reference_index).into();
        self.reference_index += 1;
        id
    }

    fn gen_ref_ident(&mut self) -> Atom {
        let id: Atom = format!("$$RSC_SERVER_REF_{0}", self.reference_index).into();
        self.reference_index += 1;
        id
    }

    fn create_bound_action_args_array_pat(&mut self, arg_len: usize) -> Pat {
        Pat::Array(ArrayPat {
            span: DUMMY_SP,
            elems: (0..arg_len)
                .map(|i| {
                    Some(Pat::Ident(
                        Ident::new(
                            format!("$$ACTION_ARG_{i}").into(),
                            DUMMY_SP,
                            self.private_ctxt,
                        )
                        .into(),
                    ))
                })
                .collect(),
            optional: false,
            type_ann: None,
        })
    }

    // Check if the function or arrow function is an action or cache function,
    // and remove any server function directive.
    fn get_directive_for_function(
        &mut self,
        maybe_body: Option<&mut BlockStmt>,
    ) -> Option<Directive> {
        let mut directive: Option<Directive> = None;

        // Even if it's a file-level action or cache module, the function body
        // might still have directives that override the module-level annotations.
        if let Some(body) = maybe_body {
            let directive_visitor = &mut DirectiveVisitor {
                config: &self.config,
                directive: None,
                has_file_directive: self.file_directive.is_some(),
                is_allowed_position: true,
                location: DirectiveLocation::FunctionBody,
                use_cache_telemetry_tracker: self.use_cache_telemetry_tracker.clone(),
            };

            body.stmts.retain(|stmt| {
                let has_directive = directive_visitor.visit_stmt(stmt);

                !has_directive
            });

            directive = directive_visitor.directive.clone();
        }

        // All exported functions inherit the file directive if they don't have their own directive.
        if self.in_exported_expr && directive.is_none() && self.file_directive.is_some() {
            return self.file_directive.clone();
        }

        directive
    }

    fn get_directive_for_module(&mut self, stmts: &mut Vec<ModuleItem>) -> Option<Directive> {
        let directive_visitor = &mut DirectiveVisitor {
            config: &self.config,
            directive: None,
            has_file_directive: false,
            is_allowed_position: true,
            location: DirectiveLocation::Module,
            use_cache_telemetry_tracker: self.use_cache_telemetry_tracker.clone(),
        };

        stmts.retain(|item| {
            if let ModuleItem::Stmt(stmt) = item {
                let has_directive = directive_visitor.visit_stmt(stmt);

                !has_directive
            } else {
                directive_visitor.is_allowed_position = false;
                true
            }
        });

        directive_visitor.directive.clone()
    }

    fn maybe_hoist_and_create_proxy_for_server_action_arrow_expr(
        &mut self,
        ids_from_closure: Vec<Name>,
        arrow: &mut ArrowExpr,
    ) -> Box<Expr> {
        let mut new_params: Vec<Param> = vec![];

        if !ids_from_closure.is_empty() {
            // First param is the encrypted closure variables.
            new_params.push(Param {
                span: DUMMY_SP,
                decorators: vec![],
                pat: Pat::Ident(IdentName::new("$$ACTION_CLOSURE_BOUND".into(), DUMMY_SP).into()),
            });
        }

        for p in arrow.params.iter() {
            new_params.push(Param::from(p.clone()));
        }

        let action_name = self.gen_action_ident();
        let action_ident = Ident::new(action_name.clone(), arrow.span, self.private_ctxt);
        let action_id = self.generate_server_reference_id(&action_name, false, Some(&new_params));

        self.has_action = true;
        self.export_actions
            .push((action_name.clone(), action_id.clone()));

        let register_action_expr = bind_args_to_ref_expr(
            annotate_ident_as_server_reference(
                action_ident.clone(),
                action_id.clone(),
                arrow.span,
                &self.comments,
            ),
            ids_from_closure
                .iter()
                .cloned()
                .map(|id| Some(id.as_arg()))
                .collect(),
            action_id.clone(),
        );

        if let BlockStmtOrExpr::BlockStmt(block) = &mut *arrow.body {
            block.visit_mut_with(&mut ClosureReplacer {
                used_ids: &ids_from_closure,
                private_ctxt: self.private_ctxt,
            });
        }

        let mut new_body: BlockStmtOrExpr = *arrow.body.clone();

        if !ids_from_closure.is_empty() {
            // Prepend the decryption declaration to the body.
            // var [arg1, arg2, arg3] = await decryptActionBoundArgs(actionId,
            // $$ACTION_CLOSURE_BOUND)
            let decryption_decl = VarDecl {
                span: DUMMY_SP,
                kind: VarDeclKind::Var,
                declare: false,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: self.create_bound_action_args_array_pat(ids_from_closure.len()),
                    init: Some(Box::new(Expr::Await(AwaitExpr {
                        span: DUMMY_SP,
                        arg: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: quote_ident!("decryptActionBoundArgs").as_callee(),
                            args: vec![
                                action_id.as_arg(),
                                quote_ident!("$$ACTION_CLOSURE_BOUND").as_arg(),
                            ],
                            ..Default::default()
                        })),
                    }))),
                    definite: Default::default(),
                }],
                ..Default::default()
            };

            match &mut new_body {
                BlockStmtOrExpr::BlockStmt(body) => {
                    body.stmts.insert(0, decryption_decl.into());
                }
                BlockStmtOrExpr::Expr(body_expr) => {
                    new_body = BlockStmtOrExpr::BlockStmt(BlockStmt {
                        span: DUMMY_SP,
                        stmts: vec![
                            decryption_decl.into(),
                            Stmt::Return(ReturnStmt {
                                span: DUMMY_SP,
                                arg: Some(body_expr.take()),
                            }),
                        ],
                        ..Default::default()
                    });
                }
            }
        }

        // Create the action export decl from the arrow function
        // export const $$RSC_SERVER_ACTION_0 = async function action($$ACTION_CLOSURE_BOUND) {}
        self.hoisted_extra_items
            .push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                span: DUMMY_SP,
                decl: VarDecl {
                    kind: VarDeclKind::Const,
                    span: DUMMY_SP,
                    decls: vec![VarDeclarator {
                        span: DUMMY_SP,
                        name: Pat::Ident(action_ident.clone().into()),
                        definite: false,
                        init: Some(Box::new(Expr::Fn(FnExpr {
                            ident: self.arrow_or_fn_expr_ident.clone(),
                            function: Box::new(Function {
                                params: new_params,
                                body: match new_body {
                                    BlockStmtOrExpr::BlockStmt(body) => Some(body),
                                    BlockStmtOrExpr::Expr(expr) => Some(BlockStmt {
                                        span: DUMMY_SP,
                                        stmts: vec![Stmt::Return(ReturnStmt {
                                            span: DUMMY_SP,
                                            arg: Some(expr),
                                        })],
                                        ..Default::default()
                                    }),
                                },
                                decorators: vec![],
                                span: DUMMY_SP,
                                is_generator: false,
                                is_async: true,
                                ..Default::default()
                            }),
                        }))),
                    }],
                    declare: Default::default(),
                    ctxt: self.private_ctxt,
                }
                .into(),
            })));

        Box::new(register_action_expr.clone())
    }

    fn maybe_hoist_and_create_proxy_for_server_action_function(
        &mut self,
        ids_from_closure: Vec<Name>,
        function: &mut Function,
        fn_name: Option<Ident>,
    ) -> Box<Expr> {
        let mut new_params: Vec<Param> = vec![];

        if !ids_from_closure.is_empty() {
            // First param is the encrypted closure variables.
            new_params.push(Param {
                span: DUMMY_SP,
                decorators: vec![],
                pat: Pat::Ident(IdentName::new("$$ACTION_CLOSURE_BOUND".into(), DUMMY_SP).into()),
            });
        }

        new_params.append(&mut function.params);

        let action_name: Atom = self.gen_action_ident();
        let action_ident = Ident::new(action_name.clone(), function.span, self.private_ctxt);
        let action_id = self.generate_server_reference_id(&action_name, false, Some(&new_params));

        self.has_action = true;
        self.export_actions
            .push((action_name.clone(), action_id.clone()));

        let register_action_expr = bind_args_to_ref_expr(
            annotate_ident_as_server_reference(
                action_ident.clone(),
                action_id.clone(),
                function.span,
                &self.comments,
            ),
            ids_from_closure
                .iter()
                .cloned()
                .map(|id| Some(id.as_arg()))
                .collect(),
            action_id.clone(),
        );

        function.body.visit_mut_with(&mut ClosureReplacer {
            used_ids: &ids_from_closure,
            private_ctxt: self.private_ctxt,
        });

        let mut new_body: Option<BlockStmt> = function.body.clone();

        if !ids_from_closure.is_empty() {
            // Prepend the decryption declaration to the body.
            // var [arg1, arg2, arg3] = await decryptActionBoundArgs(actionId,
            // $$ACTION_CLOSURE_BOUND)
            let decryption_decl = VarDecl {
                span: DUMMY_SP,
                kind: VarDeclKind::Var,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: self.create_bound_action_args_array_pat(ids_from_closure.len()),
                    init: Some(Box::new(Expr::Await(AwaitExpr {
                        span: DUMMY_SP,
                        arg: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: quote_ident!("decryptActionBoundArgs").as_callee(),
                            args: vec![
                                action_id.as_arg(),
                                quote_ident!("$$ACTION_CLOSURE_BOUND").as_arg(),
                            ],
                            ..Default::default()
                        })),
                    }))),
                    definite: Default::default(),
                }],
                ..Default::default()
            };

            if let Some(body) = &mut new_body {
                body.stmts.insert(0, decryption_decl.into());
            } else {
                new_body = Some(BlockStmt {
                    span: DUMMY_SP,
                    stmts: vec![decryption_decl.into()],
                    ..Default::default()
                });
            }
        }

        // Create the action export decl from the function
        // export const $$RSC_SERVER_ACTION_0 = async function action($$ACTION_CLOSURE_BOUND) {}
        self.hoisted_extra_items
            .push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                span: DUMMY_SP,
                decl: VarDecl {
                    kind: VarDeclKind::Const,
                    span: DUMMY_SP,
                    decls: vec![VarDeclarator {
                        span: DUMMY_SP, // TODO: need to map it to the original span?
                        name: Pat::Ident(action_ident.clone().into()),
                        definite: false,
                        init: Some(Box::new(Expr::Fn(FnExpr {
                            ident: fn_name,
                            function: Box::new(Function {
                                params: new_params,
                                body: new_body,
                                ..function.take()
                            }),
                        }))),
                    }],
                    declare: Default::default(),
                    ctxt: self.private_ctxt,
                }
                .into(),
            })));

        Box::new(register_action_expr)
    }

    fn maybe_hoist_and_create_proxy_for_cache_arrow_expr(
        &mut self,
        ids_from_closure: Vec<Name>,
        cache_kind: RcStr,
        arrow: &mut ArrowExpr,
    ) -> Box<Expr> {
        let mut new_params: Vec<Param> = vec![];

        // Add the collected closure variables as the first parameter to the
        // function. They are unencrypted and passed into this function by the
        // cache wrapper.
        if !ids_from_closure.is_empty() {
            new_params.push(Param {
                span: DUMMY_SP,
                decorators: vec![],
                pat: self.create_bound_action_args_array_pat(ids_from_closure.len()),
            });
        }

        for p in arrow.params.iter() {
            new_params.push(Param::from(p.clone()));
        }

        let cache_name: Atom = self.gen_cache_ident();
        let cache_ident = private_ident!(cache_name.clone());
        let export_name: Atom = cache_name;

        let reference_id = self.generate_server_reference_id(&export_name, true, Some(&new_params));

        self.has_cache = true;
        self.export_actions
            .push((export_name.clone(), reference_id.clone()));

        if let BlockStmtOrExpr::BlockStmt(block) = &mut *arrow.body {
            block.visit_mut_with(&mut ClosureReplacer {
                used_ids: &ids_from_closure,
                private_ctxt: self.private_ctxt,
            });
        }

        // Create the action export decl from the arrow function
        // export var cache_ident = async function() {}
        self.hoisted_extra_items
            .push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                span: DUMMY_SP,
                decl: VarDecl {
                    span: DUMMY_SP,
                    kind: VarDeclKind::Var,
                    decls: vec![VarDeclarator {
                        span: arrow.span,
                        name: Pat::Ident(cache_ident.clone().into()),
                        init: Some(wrap_cache_expr(
                            Box::new(Expr::Fn(FnExpr {
                                ident: None,
                                function: Box::new(Function {
                                    params: new_params,
                                    body: match *arrow.body.take() {
                                        BlockStmtOrExpr::BlockStmt(body) => Some(body),
                                        BlockStmtOrExpr::Expr(expr) => Some(BlockStmt {
                                            span: DUMMY_SP,
                                            stmts: vec![Stmt::Return(ReturnStmt {
                                                span: DUMMY_SP,
                                                arg: Some(expr),
                                            })],
                                            ..Default::default()
                                        }),
                                    },
                                    decorators: vec![],
                                    span: DUMMY_SP,
                                    is_generator: false,
                                    is_async: true,
                                    ..Default::default()
                                }),
                            })),
                            &cache_kind,
                            &reference_id,
                            ids_from_closure.len(),
                        )),
                        definite: false,
                    }],
                    ..Default::default()
                }
                .into(),
            })));

        if let Some(Ident { sym, .. }) = &self.arrow_or_fn_expr_ident {
            assign_name_to_ident(&cache_ident, sym.as_str(), &mut self.hoisted_extra_items);
        }

        let bound_args: Vec<_> = ids_from_closure
            .iter()
            .cloned()
            .map(|id| Some(id.as_arg()))
            .collect();

        let register_action_expr = annotate_ident_as_server_reference(
            cache_ident.clone(),
            reference_id.clone(),
            arrow.span,
            &self.comments,
        );

        // If there're any bound args from the closure, we need to hoist the
        // register action expression to the top-level, and return the bind
        // expression inline.
        if !bound_args.is_empty() {
            let ref_ident = private_ident!(self.gen_ref_ident());

            let ref_decl = VarDecl {
                span: DUMMY_SP,
                kind: VarDeclKind::Var,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: Pat::Ident(ref_ident.clone().into()),
                    init: Some(Box::new(register_action_expr.clone())),
                    definite: false,
                }],
                ..Default::default()
            };

            // Hoist the register action expression to the top-level.
            self.extra_items
                .push(ModuleItem::Stmt(Stmt::Decl(Decl::Var(Box::new(ref_decl)))));

            Box::new(bind_args_to_ref_expr(
                Expr::Ident(ref_ident.clone()),
                bound_args,
                reference_id.clone(),
            ))
        } else {
            Box::new(register_action_expr)
        }
    }

    fn maybe_hoist_and_create_proxy_for_cache_function(
        &mut self,
        ids_from_closure: Vec<Name>,
        fn_name: Option<Ident>,
        cache_kind: RcStr,
        function: &mut Function,
    ) -> Box<Expr> {
        let mut new_params: Vec<Param> = vec![];

        // Add the collected closure variables as the first parameter to the
        // function. They are unencrypted and passed into this function by the
        // cache wrapper.
        if !ids_from_closure.is_empty() {
            new_params.push(Param {
                span: DUMMY_SP,
                decorators: vec![],
                pat: self.create_bound_action_args_array_pat(ids_from_closure.len()),
            });
        }

        for p in function.params.iter() {
            new_params.push(p.clone());
        }

        let cache_name: Atom = self.gen_cache_ident();
        let cache_ident = private_ident!(cache_name.clone());

        let reference_id = self.generate_server_reference_id(&cache_name, true, Some(&new_params));

        self.has_cache = true;
        self.export_actions
            .push((cache_name.clone(), reference_id.clone()));

        let register_action_expr = annotate_ident_as_server_reference(
            cache_ident.clone(),
            reference_id.clone(),
            function.span,
            &self.comments,
        );

        function.body.visit_mut_with(&mut ClosureReplacer {
            used_ids: &ids_from_closure,
            private_ctxt: self.private_ctxt,
        });

        // export var cache_ident = async function() {}
        self.hoisted_extra_items
            .push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                span: DUMMY_SP,
                decl: VarDecl {
                    span: DUMMY_SP,
                    kind: VarDeclKind::Var,
                    decls: vec![VarDeclarator {
                        span: function.span,
                        name: Pat::Ident(cache_ident.clone().into()),
                        init: Some(wrap_cache_expr(
                            Box::new(Expr::Fn(FnExpr {
                                ident: fn_name.clone(),
                                function: Box::new(Function {
                                    params: new_params,
                                    ..function.take()
                                }),
                            })),
                            &cache_kind,
                            &reference_id,
                            ids_from_closure.len(),
                        )),
                        definite: false,
                    }],
                    ..Default::default()
                }
                .into(),
            })));

        if let Some(Ident { sym, .. }) = fn_name {
            assign_name_to_ident(&cache_ident, sym.as_str(), &mut self.hoisted_extra_items);
        } else if self.in_default_export_decl {
            assign_name_to_ident(&cache_ident, "default", &mut self.hoisted_extra_items);
        }

        let bound_args: Vec<_> = ids_from_closure
            .iter()
            .cloned()
            .map(|id| Some(id.as_arg()))
            .collect();

        // If there're any bound args from the closure, we need to hoist the
        // register action expression to the top-level, and return the bind
        // expression inline.
        if !bound_args.is_empty() {
            let ref_ident = private_ident!(self.gen_ref_ident());

            let ref_decl = VarDecl {
                span: DUMMY_SP,
                kind: VarDeclKind::Var,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: Pat::Ident(ref_ident.clone().into()),
                    init: Some(Box::new(register_action_expr.clone())),
                    definite: false,
                }],
                ..Default::default()
            };

            // Hoist the register action expression to the top-level.
            self.extra_items
                .push(ModuleItem::Stmt(Stmt::Decl(Decl::Var(Box::new(ref_decl)))));

            Box::new(bind_args_to_ref_expr(
                Expr::Ident(ref_ident.clone()),
                bound_args,
                reference_id.clone(),
            ))
        } else {
            Box::new(register_action_expr)
        }
    }
}

impl<C: Comments> VisitMut for ServerActions<C> {
    fn visit_mut_export_decl(&mut self, decl: &mut ExportDecl) {
        let old_in_exported_expr = replace(&mut self.in_exported_expr, true);
        decl.decl.visit_mut_with(self);
        self.in_exported_expr = old_in_exported_expr;
    }

    fn visit_mut_export_default_decl(&mut self, decl: &mut ExportDefaultDecl) {
        let old_in_exported_expr = replace(&mut self.in_exported_expr, true);
        let old_in_default_export_decl = replace(&mut self.in_default_export_decl, true);
        self.rewrite_default_fn_expr_to_proxy_expr = None;
        decl.decl.visit_mut_with(self);
        self.in_exported_expr = old_in_exported_expr;
        self.in_default_export_decl = old_in_default_export_decl;
    }

    fn visit_mut_export_default_expr(&mut self, expr: &mut ExportDefaultExpr) {
        let old_in_exported_expr = replace(&mut self.in_exported_expr, true);
        let old_in_default_export_decl = replace(&mut self.in_default_export_decl, true);
        expr.expr.visit_mut_with(self);
        self.in_exported_expr = old_in_exported_expr;
        self.in_default_export_decl = old_in_default_export_decl;
    }

    fn visit_mut_fn_expr(&mut self, f: &mut FnExpr) {
        let old_this_status = replace(&mut self.this_status, ThisStatus::Allowed);
        let old_arrow_or_fn_expr_ident = self.arrow_or_fn_expr_ident.clone();
        if let Some(ident) = &f.ident {
            self.arrow_or_fn_expr_ident = Some(ident.clone());
        }
        f.visit_mut_children_with(self);
        self.this_status = old_this_status;
        self.arrow_or_fn_expr_ident = old_arrow_or_fn_expr_ident;
    }

    fn visit_mut_function(&mut self, f: &mut Function) {
        let directive = self.get_directive_for_function(f.body.as_mut());
        let declared_idents_until = self.declared_idents.len();
        let old_names = take(&mut self.names);

        if let Some(directive) = &directive {
            self.this_status = ThisStatus::Forbidden {
                directive: directive.clone(),
            };
        }

        // Visit children
        {
            let old_in_module = replace(&mut self.in_module_level, false);
            let should_track_names = directive.is_some() || self.should_track_names;
            let old_should_track_names = replace(&mut self.should_track_names, should_track_names);
            let old_in_exported_expr = replace(&mut self.in_exported_expr, false);
            let old_in_default_export_decl = replace(&mut self.in_default_export_decl, false);
            let old_fn_decl_ident = self.fn_decl_ident.take();
            f.visit_mut_children_with(self);
            self.in_module_level = old_in_module;
            self.should_track_names = old_should_track_names;
            self.in_exported_expr = old_in_exported_expr;
            self.in_default_export_decl = old_in_default_export_decl;
            self.fn_decl_ident = old_fn_decl_ident;
        }

        if let Some(directive) = directive {
            if !f.is_async {
                emit_error(ServerActionsErrorKind::InlineSyncFunction {
                    span: f.span,
                    directive,
                });

                return;
            }

            let has_errors = HANDLER.with(|handler| handler.has_errors());

            // Don't hoist a function if 1) an error was emitted, or 2) we're in the client layer.
            if has_errors || !self.config.is_react_server_layer {
                return;
            }

            let mut child_names = take(&mut self.names);

            if self.should_track_names {
                self.names = [old_names, child_names.clone()].concat();
            }

            if let Directive::UseCache { cache_kind } = directive {
                // Collect all the identifiers defined inside the closure and used
                // in the cache function. With deduplication.
                retain_names_from_declared_idents(
                    &mut child_names,
                    &self.declared_idents[..declared_idents_until],
                );

                let new_expr = self.maybe_hoist_and_create_proxy_for_cache_function(
                    child_names.clone(),
                    self.fn_decl_ident
                        .clone()
                        .or(self.arrow_or_fn_expr_ident.clone()),
                    cache_kind,
                    f,
                );

                if self.in_default_export_decl {
                    // This function expression is also the default export:
                    // `export default async function() {}`
                    // This specific case (default export) isn't handled by `visit_mut_expr`.
                    // Replace the original function expr with a action proxy expr.
                    self.rewrite_default_fn_expr_to_proxy_expr = Some(new_expr);
                } else if let Some(ident) = &self.fn_decl_ident {
                    // Replace the original function declaration with a cache decl.
                    self.rewrite_fn_decl_to_proxy_decl = Some(VarDecl {
                        span: DUMMY_SP,
                        kind: VarDeclKind::Var,
                        decls: vec![VarDeclarator {
                            span: DUMMY_SP,
                            name: Pat::Ident(ident.clone().into()),
                            init: Some(new_expr),
                            definite: false,
                        }],
                        ..Default::default()
                    });
                } else {
                    self.rewrite_expr_to_proxy_expr = Some(new_expr);
                }
            } else if !(matches!(self.file_directive, Some(Directive::UseServer))
                && self.in_exported_expr)
            {
                // Collect all the identifiers defined inside the closure and used
                // in the action function. With deduplication.
                retain_names_from_declared_idents(
                    &mut child_names,
                    &self.declared_idents[..declared_idents_until],
                );

                let new_expr = self.maybe_hoist_and_create_proxy_for_server_action_function(
                    child_names,
                    f,
                    self.fn_decl_ident
                        .clone()
                        .or(self.arrow_or_fn_expr_ident.clone()),
                );

                if self.in_default_export_decl {
                    // This function expression is also the default export:
                    // `export default async function() {}`
                    // This specific case (default export) isn't handled by `visit_mut_expr`.
                    // Replace the original function expr with a action proxy expr.
                    self.rewrite_default_fn_expr_to_proxy_expr = Some(new_expr);
                } else if let Some(ident) = &self.fn_decl_ident {
                    // Replace the original function declaration with an action proxy declaration
                    // expr.
                    self.rewrite_fn_decl_to_proxy_decl = Some(VarDecl {
                        span: DUMMY_SP,
                        kind: VarDeclKind::Var,
                        decls: vec![VarDeclarator {
                            span: DUMMY_SP,
                            name: Pat::Ident(ident.clone().into()),
                            init: Some(new_expr),
                            definite: false,
                        }],
                        ..Default::default()
                    });
                } else {
                    self.rewrite_expr_to_proxy_expr = Some(new_expr);
                }
            }
        }
    }

    fn visit_mut_decl(&mut self, d: &mut Decl) {
        self.rewrite_fn_decl_to_proxy_decl = None;
        d.visit_mut_children_with(self);

        if let Some(decl) = &self.rewrite_fn_decl_to_proxy_decl {
            *d = (*decl).clone().into();
        }

        self.rewrite_fn_decl_to_proxy_decl = None;
    }

    fn visit_mut_fn_decl(&mut self, f: &mut FnDecl) {
        let old_this_status = replace(&mut self.this_status, ThisStatus::Allowed);
        let old_in_exported_expr = self.in_exported_expr;
        if self.in_module_level && self.exported_local_ids.contains(&f.ident.to_id()) {
            self.in_exported_expr = true
        }
        let old_fn_decl_ident = self.fn_decl_ident.replace(f.ident.clone());
        f.visit_mut_children_with(self);
        self.this_status = old_this_status;
        self.in_exported_expr = old_in_exported_expr;
        self.fn_decl_ident = old_fn_decl_ident;
    }

    fn visit_mut_arrow_expr(&mut self, a: &mut ArrowExpr) {
        // Arrow expressions need to be visited in prepass to determine if it's
        // an action function or not.
        let directive = self.get_directive_for_function(
            if let BlockStmtOrExpr::BlockStmt(block) = &mut *a.body {
                Some(block)
            } else {
                None
            },
        );

        if let Some(directive) = &directive {
            self.this_status = ThisStatus::Forbidden {
                directive: directive.clone(),
            };
        }

        let declared_idents_until = self.declared_idents.len();
        let old_names = take(&mut self.names);

        {
            // Visit children
            let old_in_module = replace(&mut self.in_module_level, false);
            let should_track_names = directive.is_some() || self.should_track_names;
            let old_should_track_names = replace(&mut self.should_track_names, should_track_names);
            let old_in_exported_expr = replace(&mut self.in_exported_expr, false);
            let old_in_default_export_decl = replace(&mut self.in_default_export_decl, false);
            {
                for n in &mut a.params {
                    collect_idents_in_pat(n, &mut self.declared_idents);
                }
            }
            a.visit_mut_children_with(self);
            self.in_module_level = old_in_module;
            self.should_track_names = old_should_track_names;
            self.in_exported_expr = old_in_exported_expr;
            self.in_default_export_decl = old_in_default_export_decl;
        }

        if let Some(directive) = directive {
            if !a.is_async {
                emit_error(ServerActionsErrorKind::InlineSyncFunction {
                    span: a.span,
                    directive,
                });

                return;
            }

            let has_errors = HANDLER.with(|handler| handler.has_errors());

            // Don't hoist an arrow expression if 1) an error was emitted, or 2) we're in the client
            // layer.
            if has_errors || !self.config.is_react_server_layer {
                return;
            }

            let mut child_names = take(&mut self.names);

            if self.should_track_names {
                self.names = [old_names, child_names.clone()].concat();
            }

            // Collect all the identifiers defined inside the closure and used
            // in the action function. With deduplication.
            retain_names_from_declared_idents(
                &mut child_names,
                &self.declared_idents[..declared_idents_until],
            );

            if let Directive::UseCache { cache_kind } = directive {
                self.rewrite_expr_to_proxy_expr =
                    Some(self.maybe_hoist_and_create_proxy_for_cache_arrow_expr(
                        child_names,
                        cache_kind,
                        a,
                    ));
            } else if !matches!(self.file_directive, Some(Directive::UseServer)) {
                self.rewrite_expr_to_proxy_expr = Some(
                    self.maybe_hoist_and_create_proxy_for_server_action_arrow_expr(child_names, a),
                );
            }
        }
    }

    fn visit_mut_module(&mut self, m: &mut Module) {
        self.start_pos = m.span.lo;
        m.visit_mut_children_with(self);
    }

    fn visit_mut_stmt(&mut self, n: &mut Stmt) {
        n.visit_mut_children_with(self);

        if self.in_module_level {
            return;
        }

        // If it's a closure (not in the module level), we need to collect
        // identifiers defined in the closure.
        collect_decl_idents_in_stmt(n, &mut self.declared_idents);
    }

    fn visit_mut_param(&mut self, n: &mut Param) {
        n.visit_mut_children_with(self);

        if self.in_module_level {
            return;
        }

        collect_idents_in_pat(&n.pat, &mut self.declared_idents);
    }

    fn visit_mut_prop_or_spread(&mut self, n: &mut PropOrSpread) {
        let old_arrow_or_fn_expr_ident = self.arrow_or_fn_expr_ident.clone();
        let old_in_exported_expr = self.in_exported_expr;

        match n {
            PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(ident_name),
                value: box Expr::Arrow(_) | box Expr::Fn(_),
                ..
            })) => {
                self.in_exported_expr = false;
                self.arrow_or_fn_expr_ident = Some(ident_name.clone().into());
            }
            PropOrSpread::Prop(box Prop::Method(MethodProp { key, .. })) => {
                let key = key.clone();

                if let PropName::Ident(ident_name) = &key {
                    self.arrow_or_fn_expr_ident = Some(ident_name.clone().into());
                }

                let old_this_status = replace(&mut self.this_status, ThisStatus::Allowed);
                self.rewrite_expr_to_proxy_expr = None;
                self.in_exported_expr = false;
                n.visit_mut_children_with(self);
                self.in_exported_expr = old_in_exported_expr;
                self.this_status = old_this_status;

                if let Some(expr) = self.rewrite_expr_to_proxy_expr.take() {
                    *n = PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                        key,
                        value: expr,
                    })));
                }

                return;
            }
            _ => {}
        }

        if !self.in_module_level && self.should_track_names {
            if let PropOrSpread::Prop(box Prop::Shorthand(i)) = n {
                self.names.push(Name::from(&*i));
                self.should_track_names = false;
                n.visit_mut_children_with(self);
                self.should_track_names = true;
                return;
            }
        }

        n.visit_mut_children_with(self);
        self.arrow_or_fn_expr_ident = old_arrow_or_fn_expr_ident;
        self.in_exported_expr = old_in_exported_expr;
    }

    fn visit_mut_class(&mut self, n: &mut Class) {
        let old_this_status = replace(&mut self.this_status, ThisStatus::Allowed);
        n.visit_mut_children_with(self);
        self.this_status = old_this_status;
    }

    fn visit_mut_class_member(&mut self, n: &mut ClassMember) {
        if let ClassMember::Method(ClassMethod {
            is_abstract: false,
            is_static: true,
            kind: MethodKind::Method,
            key,
            span,
            accessibility: None | Some(Accessibility::Public),
            ..
        }) = n
        {
            let key = key.clone();
            let span = *span;
            let old_arrow_or_fn_expr_ident = self.arrow_or_fn_expr_ident.clone();

            if let PropName::Ident(ident_name) = &key {
                self.arrow_or_fn_expr_ident = Some(ident_name.clone().into());
            }

            let old_this_status = replace(&mut self.this_status, ThisStatus::Allowed);
            self.rewrite_expr_to_proxy_expr = None;
            self.in_exported_expr = false;
            n.visit_mut_children_with(self);
            self.this_status = old_this_status;
            self.arrow_or_fn_expr_ident = old_arrow_or_fn_expr_ident;

            if let Some(expr) = self.rewrite_expr_to_proxy_expr.take() {
                *n = ClassMember::ClassProp(ClassProp {
                    span,
                    key,
                    value: Some(expr),
                    is_static: true,
                    ..Default::default()
                });
            }
        } else {
            n.visit_mut_children_with(self);
        }
    }

    fn visit_mut_class_method(&mut self, n: &mut ClassMethod) {
        if n.is_static {
            n.visit_mut_children_with(self);
        } else {
            let (is_action_fn, is_cache_fn) = has_body_directive(&n.function.body);

            if is_action_fn {
                emit_error(
                    ServerActionsErrorKind::InlineUseServerInClassInstanceMethod { span: n.span },
                );
            } else if is_cache_fn {
                emit_error(
                    ServerActionsErrorKind::InlineUseCacheInClassInstanceMethod { span: n.span },
                );
            } else {
                n.visit_mut_children_with(self);
            }
        }
    }

    fn visit_mut_call_expr(&mut self, n: &mut CallExpr) {
        if let Callee::Expr(box Expr::Ident(Ident { sym, .. })) = &mut n.callee {
            if sym == "jsxDEV" || sym == "_jsxDEV" {
                // Do not visit the 6th arg in a generated jsxDEV call, which is a `this`
                // expression, to avoid emitting an error for using `this` if it's
                // inside of a server function. https://github.com/facebook/react/blob/9106107/packages/react/src/jsx/ReactJSXElement.js#L429
                if n.args.len() > 4 {
                    for arg in &mut n.args[0..4] {
                        arg.visit_mut_with(self);
                    }
                    return;
                }
            }
        }

        n.visit_mut_children_with(self);
    }

    fn visit_mut_callee(&mut self, n: &mut Callee) {
        let old_in_callee = replace(&mut self.in_callee, true);
        n.visit_mut_children_with(self);
        self.in_callee = old_in_callee;
    }

    fn visit_mut_expr(&mut self, n: &mut Expr) {
        if !self.in_module_level && self.should_track_names {
            if let Ok(mut name) = Name::try_from(&*n) {
                if self.in_callee {
                    // This is a callee i.e. `foo.bar()`,
                    // we need to track the actual value instead of the method name.
                    if !name.1.is_empty() {
                        name.1.pop();
                    }
                }

                self.names.push(name);
                self.should_track_names = false;
                n.visit_mut_children_with(self);
                self.should_track_names = true;
                return;
            }
        }

        self.rewrite_expr_to_proxy_expr = None;
        n.visit_mut_children_with(self);
        if let Some(expr) = self.rewrite_expr_to_proxy_expr.take() {
            *n = *expr;
        }
    }

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        self.file_directive = self.get_directive_for_module(stmts);

        let in_cache_file = matches!(self.file_directive, Some(Directive::UseCache { .. }));
        let in_action_file = matches!(self.file_directive, Some(Directive::UseServer));

        if in_cache_file {
            // If we're in a "use cache" file, collect all original IDs from
            // export specifiers in a pre-pass so that we know which functions
            // are exported, e.g. for this case:
            // ```
            // "use cache"
            // function foo() {}
            // function Bar() {}
            // export { foo }
            // export default Bar
            // ```
            for stmt in stmts.iter() {
                match stmt {
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultExpr(export_default_expr)) => {
                        if let Expr::Ident(ident) = &*export_default_expr.expr {
                            self.exported_local_ids.insert(ident.to_id());
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named_export)) => {
                        if named_export.src.is_none() {
                            for spec in &named_export.specifiers {
                                if let ExportSpecifier::Named(ExportNamedSpecifier {
                                    orig: ModuleExportName::Ident(ident),
                                    ..
                                }) = spec
                                {
                                    self.exported_local_ids.insert(ident.to_id());
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        // Only track exported identifiers in action files or cache files.
        let should_track_exports = self.file_directive.is_some();

        let old_annotations = self.annotations.take();
        let mut new = Vec::with_capacity(stmts.len());

        for mut stmt in stmts.take() {
            // For server boundary files, it's not allowed to export things other than async
            // functions.
            if should_track_exports {
                let mut disallowed_export_span = DUMMY_SP;

                // Currently only function exports are allowed.
                match &mut stmt {
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl { decl, span })) => {
                        match decl {
                            Decl::Fn(f) => {
                                // export function foo() {}

                                let (is_action_fn, is_cache_fn) =
                                    has_body_directive(&f.function.body);

                                let ref_id = if is_action_fn {
                                    false
                                } else if is_cache_fn {
                                    true
                                } else {
                                    in_cache_file
                                };

                                // If it's a self-annotated cache function, we need to skip
                                // collecting the exported ident. Otherwise it will be double-
                                // annotated.
                                // TODO(shu): This is a workaround. We should have a better way
                                // to skip self-annotated exports here.
                                if !(is_cache_fn && self.config.is_react_server_layer) {
                                    self.exported_idents.push((
                                        f.ident.clone(),
                                        f.ident.sym.clone(),
                                        self.generate_server_reference_id(
                                            f.ident.sym.as_ref(),
                                            ref_id,
                                            Some(&f.function.params),
                                        ),
                                    ));
                                }
                            }
                            Decl::Var(var) => {
                                // export const foo = 1
                                let mut idents: Vec<Ident> = Vec::new();
                                collect_idents_in_var_decls(&var.decls, &mut idents);

                                for ident in &idents {
                                    self.exported_idents.push((
                                        ident.clone(),
                                        ident.sym.clone(),
                                        self.generate_server_reference_id(
                                            ident.sym.as_ref(),
                                            in_cache_file,
                                            None,
                                        ),
                                    ));
                                }

                                for decl in &mut var.decls {
                                    if let Some(init) = &decl.init {
                                        if let Expr::Lit(_) = &**init {
                                            // It's not allowed to export any literal.
                                            disallowed_export_span = *span;
                                        }
                                    }
                                }
                            }
                            _ => {
                                disallowed_export_span = *span;
                            }
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named)) => {
                        if named.src.is_some() {
                            disallowed_export_span = named.span;
                        } else {
                            for spec in &mut named.specifiers {
                                if let ExportSpecifier::Named(ExportNamedSpecifier {
                                    orig: ModuleExportName::Ident(ident),
                                    exported,
                                    ..
                                }) = spec
                                {
                                    if let Some(export_name) = exported {
                                        if let ModuleExportName::Ident(Ident { sym, .. }) =
                                            export_name
                                        {
                                            // export { foo as bar }
                                            self.exported_idents.push((
                                                ident.clone(),
                                                sym.clone(),
                                                self.generate_server_reference_id(
                                                    sym.as_ref(),
                                                    in_cache_file,
                                                    None,
                                                ),
                                            ));
                                        } else if let ModuleExportName::Str(str) = export_name {
                                            // export { foo as "bar" }
                                            self.exported_idents.push((
                                                ident.clone(),
                                                str.value.clone(),
                                                self.generate_server_reference_id(
                                                    str.value.as_ref(),
                                                    in_cache_file,
                                                    None,
                                                ),
                                            ));
                                        }
                                    } else {
                                        // export { foo }
                                        self.exported_idents.push((
                                            ident.clone(),
                                            ident.sym.clone(),
                                            self.generate_server_reference_id(
                                                ident.sym.as_ref(),
                                                in_cache_file,
                                                None,
                                            ),
                                        ));
                                    }
                                } else {
                                    disallowed_export_span = named.span;
                                }
                            }
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultDecl(ExportDefaultDecl {
                        decl,
                        span,
                        ..
                    })) => match decl {
                        DefaultDecl::Fn(f) => {
                            let (is_action_fn, is_cache_fn) = has_body_directive(&f.function.body);

                            let is_cache = if is_action_fn {
                                false
                            } else if is_cache_fn {
                                true
                            } else {
                                in_cache_file
                            };

                            // If it's a self-annotated cache function, we need to skip
                            // collecting the exported ident. Otherwise it will be double-
                            // annotated.
                            // TODO(shu): This is a workaround. We should have a better way
                            // to skip self-annotated exports here.
                            if !(is_cache_fn && self.config.is_react_server_layer) {
                                let ref_id = self.generate_server_reference_id(
                                    "default",
                                    is_cache,
                                    Some(&f.function.params),
                                );

                                if let Some(ident) = &f.ident {
                                    // export default function foo() {}
                                    self.exported_idents.push((
                                        ident.clone(),
                                        "default".into(),
                                        ref_id,
                                    ));
                                } else {
                                    // export default function() {}
                                    // Use the span from the function expression
                                    let span = f.function.span;

                                    let new_ident = Ident::new(
                                        self.gen_action_ident(),
                                        span,
                                        self.private_ctxt,
                                    );

                                    f.ident = Some(new_ident.clone());

                                    self.exported_idents.push((
                                        new_ident.clone(),
                                        "default".into(),
                                        ref_id,
                                    ));

                                    assign_name_to_ident(
                                        &new_ident,
                                        "default",
                                        &mut self.extra_items,
                                    );
                                }
                            }
                        }
                        _ => {
                            disallowed_export_span = *span;
                        }
                    },
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultExpr(default_expr)) => {
                        match &mut *default_expr.expr {
                            Expr::Fn(_f) => {}
                            Expr::Arrow(arrow) => {
                                // export default async () => {}
                                // Use the span of the arrow function
                                let span = arrow.span;

                                let (is_action_fn, is_cache_fn) =
                                    has_body_directive(&if let BlockStmtOrExpr::BlockStmt(block) =
                                        &*arrow.body
                                    {
                                        Some(block.clone())
                                    } else {
                                        None
                                    });

                                let is_cache = if is_action_fn {
                                    false
                                } else if is_cache_fn {
                                    true
                                } else {
                                    in_cache_file
                                };

                                // If it's a self-annotated cache function, we need to skip
                                // collecting the exported ident. Otherwise it will be double-
                                // annotated.
                                // TODO(shu): This is a workaround. We should have a better way
                                // to skip self-annotated exports here.
                                if !(is_cache_fn && self.config.is_react_server_layer) {
                                    let new_ident = Ident::new(
                                        self.gen_action_ident(),
                                        span,
                                        self.private_ctxt,
                                    );

                                    self.exported_idents.push((
                                        new_ident.clone(),
                                        "default".into(),
                                        self.generate_server_reference_id(
                                            "default",
                                            is_cache,
                                            Some(
                                                &arrow
                                                    .params
                                                    .iter()
                                                    .map(|p| Param::from(p.clone()))
                                                    .collect(),
                                            ),
                                        ),
                                    ));

                                    create_var_declarator(&new_ident, &mut self.extra_items);
                                    assign_name_to_ident(
                                        &new_ident,
                                        "default",
                                        &mut self.extra_items,
                                    );

                                    *default_expr.expr =
                                        assign_arrow_expr(&new_ident, Expr::Arrow(arrow.clone()));
                                }
                            }
                            Expr::Ident(ident) => {
                                // export default foo
                                self.exported_idents.push((
                                    ident.clone(),
                                    "default".into(),
                                    self.generate_server_reference_id(
                                        "default",
                                        in_cache_file,
                                        None,
                                    ),
                                ));
                            }
                            Expr::Call(call) => {
                                // export default fn()
                                // Determining a useful span here is tricky.
                                let span = call.span;

                                let new_ident =
                                    Ident::new(self.gen_action_ident(), span, self.private_ctxt);

                                self.exported_idents.push((
                                    new_ident.clone(),
                                    "default".into(),
                                    self.generate_server_reference_id(
                                        "default",
                                        in_cache_file,
                                        None,
                                    ),
                                ));

                                create_var_declarator(&new_ident, &mut self.extra_items);
                                assign_name_to_ident(&new_ident, "default", &mut self.extra_items);

                                *default_expr.expr =
                                    assign_arrow_expr(&new_ident, Expr::Call(call.clone()));
                            }
                            _ => {
                                disallowed_export_span = default_expr.span;
                            }
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportAll(ExportAll { span, .. })) => {
                        disallowed_export_span = *span;
                    }
                    _ => {}
                }

                if disallowed_export_span != DUMMY_SP {
                    emit_error(ServerActionsErrorKind::ExportedSyncFunction {
                        span: disallowed_export_span,
                        in_action_file,
                    });

                    return;
                }
            }

            stmt.visit_mut_with(self);

            let mut new_stmt = stmt;

            if let Some(expr) = &self.rewrite_default_fn_expr_to_proxy_expr {
                // If this happens, we need to replace the statement with a default export expr.
                new_stmt =
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultExpr(ExportDefaultExpr {
                        span: DUMMY_SP,
                        expr: expr.clone(),
                    }));
                self.rewrite_default_fn_expr_to_proxy_expr = None;
            }

            if self.config.is_react_server_layer || self.file_directive.is_none() {
                new.append(&mut self.hoisted_extra_items);
                new.push(new_stmt);
                new.extend(self.annotations.drain(..).map(ModuleItem::Stmt));
                new.append(&mut self.extra_items);
            }
        }

        let mut actions = self.export_actions.take();

        if in_action_file || in_cache_file && !self.config.is_react_server_layer {
            actions.extend(
                self.exported_idents
                    .iter()
                    .map(|e| (e.1.clone(), e.2.clone())),
            );

            if !actions.is_empty() {
                self.has_action |= in_action_file;
                self.has_cache |= in_cache_file;
            }
        };

        // Make it a hashmap of id -> name.
        let actions = actions
            .into_iter()
            .map(|a| (a.1, a.0))
            .collect::<ActionsMap>();

        // If it's compiled in the client layer, each export field needs to be
        // wrapped by a reference creation call.
        let create_ref_ident = private_ident!("createServerReference");
        let call_server_ident = private_ident!("callServer");
        let find_source_map_url_ident = private_ident!("findSourceMapURL");

        if (self.has_action || self.has_cache) && !self.config.is_react_server_layer {
            // import {
            //   createServerReference,
            //   callServer,
            //   findSourceMapURL
            // } from 'private-next-rsc-action-client-wrapper'
            // createServerReference("action_id")
            new.push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                span: DUMMY_SP,
                specifiers: vec![
                    ImportSpecifier::Named(ImportNamedSpecifier {
                        span: DUMMY_SP,
                        local: create_ref_ident.clone(),
                        imported: None,
                        is_type_only: false,
                    }),
                    ImportSpecifier::Named(ImportNamedSpecifier {
                        span: DUMMY_SP,
                        local: call_server_ident.clone(),
                        imported: None,
                        is_type_only: false,
                    }),
                    ImportSpecifier::Named(ImportNamedSpecifier {
                        span: DUMMY_SP,
                        local: find_source_map_url_ident.clone(),
                        imported: None,
                        is_type_only: false,
                    }),
                ],
                src: Box::new(Str {
                    span: DUMMY_SP,
                    value: "private-next-rsc-action-client-wrapper".into(),
                    raw: None,
                }),
                type_only: false,
                with: None,
                phase: Default::default(),
            })));
            new.rotate_right(1);
        }

        // If it's a "use server" or a "use cache" file, all exports need to be annotated.
        if should_track_exports {
            for (ident, export_name, ref_id) in self.exported_idents.iter() {
                if !self.config.is_react_server_layer {
                    if export_name == "default" {
                        self.comments.add_pure_comment(ident.span.lo);

                        let export_expr = ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultExpr(
                            ExportDefaultExpr {
                                span: DUMMY_SP,
                                expr: Box::new(Expr::Call(CallExpr {
                                    span: ident.span,
                                    callee: Callee::Expr(Box::new(Expr::Ident(
                                        create_ref_ident.clone(),
                                    ))),
                                    args: vec![
                                        ref_id.clone().as_arg(),
                                        call_server_ident.clone().as_arg(),
                                        Expr::undefined(DUMMY_SP).as_arg(),
                                        find_source_map_url_ident.clone().as_arg(),
                                        "default".as_arg(),
                                    ],
                                    ..Default::default()
                                })),
                            },
                        ));
                        new.push(export_expr);
                    } else {
                        let call_expr_span = Span::dummy_with_cmt();
                        self.comments.add_pure_comment(call_expr_span.lo);

                        let export_expr =
                            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                                span: DUMMY_SP,
                                decl: Decl::Var(Box::new(VarDecl {
                                    span: DUMMY_SP,
                                    kind: VarDeclKind::Var,
                                    decls: vec![VarDeclarator {
                                        span: DUMMY_SP,
                                        name: Pat::Ident(
                                            IdentName::new(export_name.clone(), ident.span).into(),
                                        ),
                                        init: Some(Box::new(Expr::Call(CallExpr {
                                            span: call_expr_span,
                                            callee: Callee::Expr(Box::new(Expr::Ident(
                                                create_ref_ident.clone(),
                                            ))),
                                            args: vec![
                                                ref_id.clone().as_arg(),
                                                call_server_ident.clone().as_arg(),
                                                Expr::undefined(DUMMY_SP).as_arg(),
                                                find_source_map_url_ident.clone().as_arg(),
                                                export_name.clone().as_arg(),
                                            ],
                                            ..Default::default()
                                        }))),
                                        definite: false,
                                    }],
                                    ..Default::default()
                                })),
                            }));
                        new.push(export_expr);
                    }
                } else if !in_cache_file {
                    self.annotations.push(Stmt::Expr(ExprStmt {
                        span: DUMMY_SP,
                        expr: Box::new(annotate_ident_as_server_reference(
                            ident.clone(),
                            ref_id.clone(),
                            ident.span,
                            &self.comments,
                        )),
                    }));
                }
            }

            // Ensure that the exports are functions by appending a runtime check:
            //
            //   import { ensureServerEntryExports } from 'private-next-rsc-action-validate'
            //   ensureServerEntryExports([action1, action2, ...])
            //
            // But it's only needed for the server layer, because on the client
            // layer they're transformed into references already.
            if (self.has_action || self.has_cache) && self.config.is_react_server_layer {
                new.append(&mut self.extra_items);

                // For "use cache" files, there's no need to do extra annotations.
                if !in_cache_file && !self.exported_idents.is_empty() {
                    let ensure_ident = private_ident!("ensureServerEntryExports");
                    new.push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                        span: DUMMY_SP,
                        specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                            span: DUMMY_SP,
                            local: ensure_ident.clone(),
                            imported: None,
                            is_type_only: false,
                        })],
                        src: Box::new(Str {
                            span: DUMMY_SP,
                            value: "private-next-rsc-action-validate".into(),
                            raw: None,
                        }),
                        type_only: false,
                        with: None,
                        phase: Default::default(),
                    })));
                    new.push(ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                        span: DUMMY_SP,
                        expr: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: Callee::Expr(Box::new(Expr::Ident(ensure_ident))),
                            args: vec![ExprOrSpread {
                                spread: None,
                                expr: Box::new(Expr::Array(ArrayLit {
                                    span: DUMMY_SP,
                                    elems: self
                                        .exported_idents
                                        .iter()
                                        .map(|(ident, _, _)| {
                                            Some(ExprOrSpread {
                                                spread: None,
                                                expr: Box::new(Expr::Ident(ident.clone())),
                                            })
                                        })
                                        .collect(),
                                })),
                            }],
                            ..Default::default()
                        })),
                    })));
                }

                // Append annotations to the end of the file.
                new.extend(self.annotations.drain(..).map(ModuleItem::Stmt));
            }
        }

        if self.has_action || self.has_cache {
            // Prepend a special comment to the top of the file.
            self.comments.add_leading(
                self.start_pos,
                Comment {
                    span: DUMMY_SP,
                    kind: CommentKind::Block,
                    text: generate_server_actions_comment(actions).into(),
                },
            );
        }

        // import { cache as $$cache__ } from "private-next-rsc-cache-wrapper";
        if self.has_cache && self.config.is_react_server_layer {
            new.push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                span: DUMMY_SP,
                specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                    span: DUMMY_SP,
                    local: quote_ident!("$$cache__").into(),
                    imported: Some(quote_ident!("cache").into()),
                    is_type_only: false,
                })],
                src: Box::new(Str {
                    span: DUMMY_SP,
                    value: "private-next-rsc-cache-wrapper".into(),
                    raw: None,
                }),
                type_only: false,
                with: None,
                phase: Default::default(),
            })));

            // Make it the first item
            new.rotate_right(1);
        }

        if (self.has_action || self.has_cache) && self.config.is_react_server_layer {
            // Inlined actions are only allowed on the server layer.
            // import { registerServerReference } from 'private-next-rsc-server-reference'
            new.push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                span: DUMMY_SP,
                specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                    span: DUMMY_SP,
                    local: quote_ident!("registerServerReference").into(),
                    imported: None,
                    is_type_only: false,
                })],
                src: Box::new(Str {
                    span: DUMMY_SP,
                    value: "private-next-rsc-server-reference".into(),
                    raw: None,
                }),
                type_only: false,
                with: None,
                phase: Default::default(),
            })));

            // Encryption and decryption only happens on the server layer.
            // import { encryptActionBoundArgs, decryptActionBoundArgs } from
            // 'private-next-rsc-action-encryption'
            new.push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                span: DUMMY_SP,
                specifiers: vec![
                    ImportSpecifier::Named(ImportNamedSpecifier {
                        span: DUMMY_SP,
                        local: quote_ident!("encryptActionBoundArgs").into(),
                        imported: None,
                        is_type_only: false,
                    }),
                    ImportSpecifier::Named(ImportNamedSpecifier {
                        span: DUMMY_SP,
                        local: quote_ident!("decryptActionBoundArgs").into(),
                        imported: None,
                        is_type_only: false,
                    }),
                ],
                src: Box::new(Str {
                    span: DUMMY_SP,
                    value: "private-next-rsc-action-encryption".into(),
                    raw: None,
                }),
                type_only: false,
                with: None,
                phase: Default::default(),
            })));

            // Make it the first item
            new.rotate_right(2);
        }

        *stmts = new;

        self.annotations = old_annotations;
    }

    fn visit_mut_stmts(&mut self, stmts: &mut Vec<Stmt>) {
        let old_annotations = self.annotations.take();

        let mut new = Vec::with_capacity(stmts.len());
        for mut stmt in stmts.take() {
            stmt.visit_mut_with(self);

            new.push(stmt);
            new.append(&mut self.annotations);
        }

        *stmts = new;

        self.annotations = old_annotations;
    }

    fn visit_mut_jsx_attr(&mut self, attr: &mut JSXAttr) {
        let old_arrow_or_fn_expr_ident = self.arrow_or_fn_expr_ident.take();

        if let (Some(JSXAttrValue::JSXExprContainer(container)), JSXAttrName::Ident(ident_name)) =
            (&attr.value, &attr.name)
        {
            match &container.expr {
                JSXExpr::Expr(box Expr::Arrow(_)) | JSXExpr::Expr(box Expr::Fn(_)) => {
                    self.arrow_or_fn_expr_ident = Some(ident_name.clone().into());
                }
                _ => {}
            }
        }

        attr.visit_mut_children_with(self);
        self.arrow_or_fn_expr_ident = old_arrow_or_fn_expr_ident;
    }

    fn visit_mut_var_declarator(&mut self, var_declarator: &mut VarDeclarator) {
        let old_in_exported_expr = self.in_exported_expr;
        let old_arrow_or_fn_expr_ident = self.arrow_or_fn_expr_ident.take();

        if let (Pat::Ident(ident), Some(box Expr::Arrow(_) | box Expr::Fn(_))) =
            (&var_declarator.name, &var_declarator.init)
        {
            if self.in_module_level && self.exported_local_ids.contains(&ident.to_id()) {
                self.in_exported_expr = true
            }

            self.arrow_or_fn_expr_ident = Some(ident.id.clone());
        }

        var_declarator.visit_mut_children_with(self);

        self.in_exported_expr = old_in_exported_expr;
        self.arrow_or_fn_expr_ident = old_arrow_or_fn_expr_ident;
    }

    fn visit_mut_assign_expr(&mut self, assign_expr: &mut AssignExpr) {
        let old_arrow_or_fn_expr_ident = self.arrow_or_fn_expr_ident.clone();

        if let (
            AssignTarget::Simple(SimpleAssignTarget::Ident(ident)),
            box Expr::Arrow(_) | box Expr::Fn(_),
        ) = (&assign_expr.left, &assign_expr.right)
        {
            // Ignore assignment expressions that we created.
            if !ident.id.to_id().0.starts_with("$$RSC_SERVER_") {
                self.arrow_or_fn_expr_ident = Some(ident.id.clone());
            }
        }

        assign_expr.visit_mut_children_with(self);
        self.arrow_or_fn_expr_ident = old_arrow_or_fn_expr_ident;
    }

    fn visit_mut_this_expr(&mut self, n: &mut ThisExpr) {
        if let ThisStatus::Forbidden { directive } = &self.this_status {
            emit_error(ServerActionsErrorKind::ForbiddenExpression {
                span: n.span,
                expr: "this".into(),
                directive: directive.clone(),
            });
        }
    }

    fn visit_mut_super(&mut self, n: &mut Super) {
        if let ThisStatus::Forbidden { directive } = &self.this_status {
            emit_error(ServerActionsErrorKind::ForbiddenExpression {
                span: n.span,
                expr: "super".into(),
                directive: directive.clone(),
            });
        }
    }

    fn visit_mut_ident(&mut self, n: &mut Ident) {
        if n.sym == *"arguments" {
            if let ThisStatus::Forbidden { directive } = &self.this_status {
                emit_error(ServerActionsErrorKind::ForbiddenExpression {
                    span: n.span,
                    expr: "arguments".into(),
                    directive: directive.clone(),
                });
            }
        }
    }

    noop_visit_mut_type!();
}

fn retain_names_from_declared_idents(
    child_names: &mut Vec<Name>,
    current_declared_idents: &[Ident],
) {
    // Collect the names to retain in a separate vector
    let mut retained_names = Vec::new();

    for name in child_names.iter() {
        let mut should_retain = true;

        // Merge child_names. For example if both `foo.bar` and `foo.bar.baz` are used,
        // we only need to keep `foo.bar` as it covers the other.

        // Currently this is O(n^2) and we can potentially improve this to O(n log n)
        // by sorting or using a hashset.
        for another_name in child_names.iter() {
            if name != another_name
                && name.0 == another_name.0
                && name.1.len() >= another_name.1.len()
            {
                let mut is_prefix = true;
                for i in 0..another_name.1.len() {
                    if name.1[i] != another_name.1[i] {
                        is_prefix = false;
                        break;
                    }
                }
                if is_prefix {
                    should_retain = false;
                    break;
                }
            }
        }

        if should_retain
            && current_declared_idents
                .iter()
                .any(|ident| ident.to_id() == name.0)
            && !retained_names.contains(name)
        {
            retained_names.push(name.clone());
        }
    }

    // Replace the original child_names with the retained names
    *child_names = retained_names;
}

fn wrap_cache_expr(expr: Box<Expr>, name: &str, id: &str, bound_args_len: usize) -> Box<Expr> {
    // expr -> $$cache__("name", "id", 0, expr)
    Box::new(Expr::Call(CallExpr {
        span: DUMMY_SP,
        callee: quote_ident!("$$cache__").as_callee(),
        args: vec![
            ExprOrSpread {
                spread: None,
                expr: Box::new(name.into()),
            },
            ExprOrSpread {
                spread: None,
                expr: Box::new(id.into()),
            },
            Number::from(bound_args_len).as_arg(),
            expr.as_arg(),
        ],
        ..Default::default()
    }))
}

fn create_var_declarator(ident: &Ident, extra_items: &mut Vec<ModuleItem>) {
    // Create the variable `var $$ACTION_0;`
    extra_items.push(ModuleItem::Stmt(Stmt::Decl(Decl::Var(Box::new(VarDecl {
        span: DUMMY_SP,
        kind: VarDeclKind::Var,
        decls: vec![VarDeclarator {
            span: DUMMY_SP,
            name: ident.clone().into(),
            init: None,
            definite: Default::default(),
        }],
        ..Default::default()
    })))));
}

fn assign_name_to_ident(ident: &Ident, name: &str, extra_items: &mut Vec<ModuleItem>) {
    // Assign a name with `Object.defineProperty($$ACTION_0, 'name', {value: 'default'})`
    extra_items.push(ModuleItem::Stmt(Stmt::Expr(ExprStmt {
        span: DUMMY_SP,
        expr: Box::new(Expr::Call(CallExpr {
            span: DUMMY_SP,
            callee: Callee::Expr(Box::new(Expr::Member(MemberExpr {
                span: DUMMY_SP,
                obj: Box::new(Expr::Ident(Ident::new(
                    "Object".into(),
                    DUMMY_SP,
                    ident.ctxt,
                ))),
                prop: MemberProp::Ident(IdentName::new("defineProperty".into(), DUMMY_SP)),
            }))),
            args: vec![
                ExprOrSpread {
                    spread: None,
                    expr: Box::new(Expr::Ident(ident.clone())),
                },
                ExprOrSpread {
                    spread: None,
                    expr: Box::new("name".into()),
                },
                ExprOrSpread {
                    spread: None,
                    expr: Box::new(Expr::Object(ObjectLit {
                        span: DUMMY_SP,
                        props: vec![
                            PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                                key: PropName::Str("value".into()),
                                value: Box::new(name.into()),
                            }))),
                            PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                                key: PropName::Str("writable".into()),
                                value: Box::new(false.into()),
                            }))),
                        ],
                    })),
                },
            ],
            ..Default::default()
        })),
    })));
}

fn assign_arrow_expr(ident: &Ident, expr: Expr) -> Expr {
    if let Expr::Paren(_paren) = &expr {
        expr
    } else {
        // Create the assignment `($$ACTION_0 = arrow)`
        Expr::Paren(ParenExpr {
            span: DUMMY_SP,
            expr: Box::new(Expr::Assign(AssignExpr {
                span: DUMMY_SP,
                left: ident.clone().into(),
                op: op!("="),
                right: Box::new(expr),
            })),
        })
    }
}

fn annotate_ident_as_server_reference(
    ident: Ident,
    action_id: Atom,
    original_span: Span,
    comments: &dyn Comments,
) -> Expr {
    if !original_span.lo.is_dummy() {
        comments.add_leading(
            original_span.lo,
            Comment {
                kind: CommentKind::Block,
                span: original_span,
                text: "#__TURBOPACK_DISABLE_EXPORT_MERGING__".into(),
            },
        );
    }

    // registerServerReference(reference, id, null)
    Expr::Call(CallExpr {
        span: original_span,
        callee: quote_ident!("registerServerReference").as_callee(),
        args: vec![
            ExprOrSpread {
                spread: None,
                expr: Box::new(Expr::Ident(ident)),
            },
            ExprOrSpread {
                spread: None,
                expr: Box::new(action_id.clone().into()),
            },
            ExprOrSpread {
                spread: None,
                expr: Box::new(Expr::Lit(Lit::Null(Null { span: DUMMY_SP }))),
            },
        ],
        ..Default::default()
    })
}

fn bind_args_to_ref_expr(expr: Expr, bound: Vec<Option<ExprOrSpread>>, action_id: Atom) -> Expr {
    if bound.is_empty() {
        expr
    } else {
        // expr.bind(null, [encryptActionBoundArgs("id", arg1, arg2, ...)])
        Expr::Call(CallExpr {
            span: DUMMY_SP,
            callee: Expr::Member(MemberExpr {
                span: DUMMY_SP,
                obj: Box::new(expr),
                prop: MemberProp::Ident(quote_ident!("bind")),
            })
            .as_callee(),
            args: vec![
                ExprOrSpread {
                    spread: None,
                    expr: Box::new(Expr::Lit(Lit::Null(Null { span: DUMMY_SP }))),
                },
                ExprOrSpread {
                    spread: None,
                    expr: Box::new(Expr::Call(CallExpr {
                        span: DUMMY_SP,
                        callee: quote_ident!("encryptActionBoundArgs").as_callee(),
                        args: std::iter::once(ExprOrSpread {
                            spread: None,
                            expr: Box::new(action_id.into()),
                        })
                        .chain(bound.into_iter().flatten())
                        .collect(),
                        ..Default::default()
                    })),
                },
            ],
            ..Default::default()
        })
    }
}

// Detects if two strings are similar (but not the same).
// This implementation is fast and simple as it allows only one
// edit (add, remove, edit, swap), instead of using a N^2 Levenshtein algorithm.
//
// Example of similar strings of "use server":
// "use servers",
// "use-server",
// "use sevrer",
// "use srever",
// "use servre",
// "user server",
//
// This avoids accidental typos as there's currently no other static analysis
// tool to help when these mistakes happen.
fn detect_similar_strings(a: &str, b: &str) -> bool {
    let mut a = a.chars().collect::<Vec<char>>();
    let mut b = b.chars().collect::<Vec<char>>();

    if a.len() < b.len() {
        (a, b) = (b, a);
    }

    if a.len() == b.len() {
        // Same length, get the number of character differences.
        let mut diff = 0;
        for i in 0..a.len() {
            if a[i] != b[i] {
                diff += 1;
                if diff > 2 {
                    return false;
                }
            }
        }

        // Should be 1 or 2, but not 0.
        diff != 0
    } else {
        if a.len() - b.len() > 1 {
            return false;
        }

        // A has one more character than B.
        for i in 0..b.len() {
            if a[i] != b[i] {
                // This should be the only difference, a[i+1..] should be equal to b[i..].
                // Otherwise, they're not considered similar.
                // A: "use srerver"
                // B: "use server"
                //          ^
                return a[i + 1..] == b[i..];
            }
        }

        // This happens when the last character of A is an extra character.
        true
    }
}

// Check if the function or arrow function has any action or cache directives,
// without mutating the function body or erroring out.
// This is used to quickly determine if we need to use the module-level
// directives for this function or not.
fn has_body_directive(maybe_body: &Option<BlockStmt>) -> (bool, bool) {
    let mut is_action_fn = false;
    let mut is_cache_fn = false;

    if let Some(body) = maybe_body {
        for stmt in body.stmts.iter() {
            match stmt {
                Stmt::Expr(ExprStmt {
                    expr: box Expr::Lit(Lit::Str(Str { value, .. })),
                    ..
                }) => {
                    if value == "use server" {
                        is_action_fn = true;
                        break;
                    } else if value == "use cache" || value.starts_with("use cache: ") {
                        is_cache_fn = true;
                        break;
                    }
                }
                _ => break,
            }
        }
    }

    (is_action_fn, is_cache_fn)
}

fn collect_idents_in_array_pat(elems: &[Option<Pat>], idents: &mut Vec<Ident>) {
    for elem in elems.iter().flatten() {
        match elem {
            Pat::Ident(ident) => {
                idents.push(ident.id.clone());
            }
            Pat::Array(array) => {
                collect_idents_in_array_pat(&array.elems, idents);
            }
            Pat::Object(object) => {
                collect_idents_in_object_pat(&object.props, idents);
            }
            Pat::Rest(rest) => {
                if let Pat::Ident(ident) = &*rest.arg {
                    idents.push(ident.id.clone());
                }
            }
            Pat::Assign(AssignPat { left, .. }) => {
                collect_idents_in_pat(left, idents);
            }
            Pat::Expr(..) | Pat::Invalid(..) => {}
        }
    }
}

fn collect_idents_in_object_pat(props: &[ObjectPatProp], idents: &mut Vec<Ident>) {
    for prop in props {
        match prop {
            ObjectPatProp::KeyValue(KeyValuePatProp { key, value }) => {
                if let PropName::Ident(ident) = key {
                    idents.push(Ident::new(
                        ident.sym.clone(),
                        ident.span,
                        SyntaxContext::empty(),
                    ));
                }

                match &**value {
                    Pat::Ident(ident) => {
                        idents.push(ident.id.clone());
                    }
                    Pat::Array(array) => {
                        collect_idents_in_array_pat(&array.elems, idents);
                    }
                    Pat::Object(object) => {
                        collect_idents_in_object_pat(&object.props, idents);
                    }
                    _ => {}
                }
            }
            ObjectPatProp::Assign(AssignPatProp { key, .. }) => {
                idents.push(key.id.clone());
            }
            ObjectPatProp::Rest(RestPat { arg, .. }) => {
                if let Pat::Ident(ident) = &**arg {
                    idents.push(ident.id.clone());
                }
            }
        }
    }
}

fn collect_idents_in_var_decls(decls: &[VarDeclarator], idents: &mut Vec<Ident>) {
    for decl in decls {
        collect_idents_in_pat(&decl.name, idents);
    }
}

fn collect_idents_in_pat(pat: &Pat, idents: &mut Vec<Ident>) {
    match pat {
        Pat::Ident(ident) => {
            idents.push(ident.id.clone());
        }
        Pat::Array(array) => {
            collect_idents_in_array_pat(&array.elems, idents);
        }
        Pat::Object(object) => {
            collect_idents_in_object_pat(&object.props, idents);
        }
        Pat::Assign(AssignPat { left, .. }) => {
            collect_idents_in_pat(left, idents);
        }
        Pat::Rest(RestPat { arg, .. }) => {
            if let Pat::Ident(ident) = &**arg {
                idents.push(ident.id.clone());
            }
        }
        Pat::Expr(..) | Pat::Invalid(..) => {}
    }
}

fn collect_decl_idents_in_stmt(stmt: &Stmt, idents: &mut Vec<Ident>) {
    if let Stmt::Decl(decl) = stmt {
        match decl {
            Decl::Var(var) => {
                collect_idents_in_var_decls(&var.decls, idents);
            }
            Decl::Fn(fn_decl) => {
                idents.push(fn_decl.ident.clone());
            }
            _ => {}
        }
    }
}

struct DirectiveVisitor<'a> {
    config: &'a Config,
    location: DirectiveLocation,
    directive: Option<Directive>,
    has_file_directive: bool,
    is_allowed_position: bool,
    use_cache_telemetry_tracker: Rc<RefCell<FxHashMap<String, usize>>>,
}

impl DirectiveVisitor<'_> {
    /**
     * Returns `true` if the statement contains a server directive.
     * The found directive is assigned to `DirectiveVisitor::directive`.
     */
    fn visit_stmt(&mut self, stmt: &Stmt) -> bool {
        let in_fn_body = matches!(self.location, DirectiveLocation::FunctionBody);
        let allow_inline = self.config.is_react_server_layer || self.has_file_directive;

        match stmt {
            Stmt::Expr(ExprStmt {
                expr: box Expr::Lit(Lit::Str(Str { value, span, .. })),
                ..
            }) => {
                if value == "use server" {
                    if in_fn_body && !allow_inline {
                        emit_error(ServerActionsErrorKind::InlineUseServerInClientComponent {
                            span: *span,
                        })
                    } else if let Some(Directive::UseCache { .. }) = self.directive {
                        emit_error(ServerActionsErrorKind::MultipleDirectives {
                            span: *span,
                            location: self.location.clone(),
                        });
                    } else if self.is_allowed_position {
                        self.directive = Some(Directive::UseServer);

                        return true;
                    } else {
                        emit_error(ServerActionsErrorKind::MisplacedDirective {
                            span: *span,
                            directive: value.to_string(),
                            location: self.location.clone(),
                        });
                    }
                } else if detect_similar_strings(value, "use server") {
                    // Detect typo of "use server"
                    emit_error(ServerActionsErrorKind::MisspelledDirective {
                        span: *span,
                        directive: value.to_string(),
                        expected_directive: "use server".to_string(),
                    });
                } else if value == "use action" {
                    emit_error(ServerActionsErrorKind::MisspelledDirective {
                        span: *span,
                        directive: value.to_string(),
                        expected_directive: "use server".to_string(),
                    });
                } else
                // `use cache` or `use cache: foo`
                if value == "use cache" || value.starts_with("use cache: ") {
                    // Increment telemetry counter tracking usage of "use cache" directives

                    if in_fn_body && !allow_inline {
                        emit_error(ServerActionsErrorKind::InlineUseCacheInClientComponent {
                            span: *span,
                        })
                    } else if let Some(Directive::UseServer) = self.directive {
                        emit_error(ServerActionsErrorKind::MultipleDirectives {
                            span: *span,
                            location: self.location.clone(),
                        });
                    } else if self.is_allowed_position {
                        if !self.config.use_cache_enabled {
                            emit_error(ServerActionsErrorKind::UseCacheWithoutExperimentalFlag {
                                span: *span,
                                directive: value.to_string(),
                            });
                        }

                        if value == "use cache" {
                            self.directive = Some(Directive::UseCache {
                                cache_kind: RcStr::from("default"),
                            });
                            self.increment_cache_usage_counter("default");
                        } else {
                            // Slice the value after "use cache: "
                            let cache_kind = RcStr::from(value.split_at("use cache: ".len()).1);

                            if !self.config.cache_kinds.contains(&cache_kind) {
                                emit_error(ServerActionsErrorKind::UnknownCacheKind {
                                    span: *span,
                                    cache_kind: cache_kind.clone(),
                                });
                            }

                            self.increment_cache_usage_counter(&cache_kind);
                            self.directive = Some(Directive::UseCache { cache_kind });
                        }

                        return true;
                    } else {
                        emit_error(ServerActionsErrorKind::MisplacedDirective {
                            span: *span,
                            directive: value.to_string(),
                            location: self.location.clone(),
                        });
                    }
                } else {
                    // Detect typo of "use cache"
                    if detect_similar_strings(value, "use cache") {
                        emit_error(ServerActionsErrorKind::MisspelledDirective {
                            span: *span,
                            directive: value.to_string(),
                            expected_directive: "use cache".to_string(),
                        });
                    }
                }
            }
            Stmt::Expr(ExprStmt {
                expr:
                    box Expr::Paren(ParenExpr {
                        expr: box Expr::Lit(Lit::Str(Str { value, .. })),
                        ..
                    }),
                span,
                ..
            }) => {
                // Match `("use server")`.
                if value == "use server" || detect_similar_strings(value, "use server") {
                    if self.is_allowed_position {
                        emit_error(ServerActionsErrorKind::WrappedDirective {
                            span: *span,
                            directive: "use server".to_string(),
                        });
                    } else {
                        emit_error(ServerActionsErrorKind::MisplacedWrappedDirective {
                            span: *span,
                            directive: "use server".to_string(),
                            location: self.location.clone(),
                        });
                    }
                } else if value == "use cache" || detect_similar_strings(value, "use cache") {
                    if self.is_allowed_position {
                        emit_error(ServerActionsErrorKind::WrappedDirective {
                            span: *span,
                            directive: "use cache".to_string(),
                        });
                    } else {
                        emit_error(ServerActionsErrorKind::MisplacedWrappedDirective {
                            span: *span,
                            directive: "use cache".to_string(),
                            location: self.location.clone(),
                        });
                    }
                }
            }
            _ => {
                // Directives must not be placed after other statements.
                self.is_allowed_position = false;
            }
        };

        false
    }

    // Increment telemetry counter tracking usage of "use cache" directives
    fn increment_cache_usage_counter(&mut self, cache_kind: &str) {
        let mut tracker_map = RefCell::borrow_mut(&self.use_cache_telemetry_tracker);
        let entry = tracker_map.entry(cache_kind.to_string());
        match entry {
            hash_map::Entry::Occupied(mut occupied) => {
                *occupied.get_mut() += 1;
            }
            hash_map::Entry::Vacant(vacant) => {
                vacant.insert(1);
            }
        }
    }
}

pub(crate) struct ClosureReplacer<'a> {
    used_ids: &'a [Name],
    private_ctxt: SyntaxContext,
}

impl ClosureReplacer<'_> {
    fn index(&self, e: &Expr) -> Option<usize> {
        let name = Name::try_from(e).ok()?;
        self.used_ids.iter().position(|used_id| *used_id == name)
    }
}

impl VisitMut for ClosureReplacer<'_> {
    fn visit_mut_expr(&mut self, e: &mut Expr) {
        e.visit_mut_children_with(self);

        if let Some(index) = self.index(e) {
            *e = Expr::Ident(Ident::new(
                // $$ACTION_ARG_0
                format!("$$ACTION_ARG_{index}").into(),
                DUMMY_SP,
                self.private_ctxt,
            ));
        }
    }

    fn visit_mut_prop_or_spread(&mut self, n: &mut PropOrSpread) {
        n.visit_mut_children_with(self);

        if let PropOrSpread::Prop(box Prop::Shorthand(i)) = n {
            let name = Name::from(&*i);
            if let Some(index) = self.used_ids.iter().position(|used_id| *used_id == name) {
                *n = PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                    key: PropName::Ident(i.clone().into()),
                    value: Box::new(Expr::Ident(Ident::new(
                        // $$ACTION_ARG_0
                        format!("$$ACTION_ARG_{index}").into(),
                        DUMMY_SP,
                        self.private_ctxt,
                    ))),
                })));
            }
        }
    }

    noop_visit_mut_type!();
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NamePart {
    prop: Atom,
    is_member: bool,
    optional: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Name(Id, Vec<NamePart>);

impl From<&'_ Ident> for Name {
    fn from(value: &Ident) -> Self {
        Name(value.to_id(), vec![])
    }
}

impl TryFrom<&'_ Expr> for Name {
    type Error = ();

    fn try_from(value: &Expr) -> Result<Self, Self::Error> {
        match value {
            Expr::Ident(i) => Ok(Name(i.to_id(), vec![])),
            Expr::Member(e) => e.try_into(),
            Expr::OptChain(e) => e.try_into(),
            _ => Err(()),
        }
    }
}

impl TryFrom<&'_ MemberExpr> for Name {
    type Error = ();

    fn try_from(value: &MemberExpr) -> Result<Self, Self::Error> {
        match &value.prop {
            MemberProp::Ident(prop) => {
                let mut obj: Name = value.obj.as_ref().try_into()?;
                obj.1.push(NamePart {
                    prop: prop.sym.clone(),
                    is_member: true,
                    optional: false,
                });
                Ok(obj)
            }
            _ => Err(()),
        }
    }
}

impl TryFrom<&'_ OptChainExpr> for Name {
    type Error = ();

    fn try_from(value: &OptChainExpr) -> Result<Self, Self::Error> {
        match &*value.base {
            OptChainBase::Member(m) => match &m.prop {
                MemberProp::Ident(prop) => {
                    let mut obj: Name = m.obj.as_ref().try_into()?;
                    obj.1.push(NamePart {
                        prop: prop.sym.clone(),
                        is_member: false,
                        optional: value.optional,
                    });
                    Ok(obj)
                }
                _ => Err(()),
            },
            OptChainBase::Call(_) => Err(()),
        }
    }
}

impl From<Name> for Box<Expr> {
    fn from(value: Name) -> Self {
        let mut expr = Box::new(Expr::Ident(value.0.into()));

        for NamePart {
            prop,
            is_member,
            optional,
        } in value.1.into_iter()
        {
            if is_member {
                expr = Box::new(Expr::Member(MemberExpr {
                    span: DUMMY_SP,
                    obj: expr,
                    prop: MemberProp::Ident(IdentName::new(prop, DUMMY_SP)),
                }));
            } else {
                expr = Box::new(Expr::OptChain(OptChainExpr {
                    span: DUMMY_SP,
                    base: Box::new(OptChainBase::Member(MemberExpr {
                        span: DUMMY_SP,
                        obj: expr,
                        prop: MemberProp::Ident(IdentName::new(prop, DUMMY_SP)),
                    })),
                    optional,
                }));
            }
        }

        expr
    }
}

fn emit_error(error_kind: ServerActionsErrorKind) {
    let (span, msg) = match error_kind {
        ServerActionsErrorKind::ExportedSyncFunction {
            span,
            in_action_file,
        } => (
            span,
            formatdoc! {
                r#"
                    Only async functions are allowed to be exported in a {directive} file.
                "#,
                directive = if in_action_file {
                    "\"use server\""
                } else {
                    "\"use cache\""
                }
            },
        ),
        ServerActionsErrorKind::ForbiddenExpression {
            span,
            expr,
            directive,
        } => (
            span,
            formatdoc! {
                r#"
                    {subject} cannot use `{expr}`.
                "#,
                subject = if let Directive::UseServer = directive {
                    "Server Actions"
                } else {
                    "\"use cache\" functions"
                }
            },
        ),
        ServerActionsErrorKind::InlineUseCacheInClassInstanceMethod { span } => (
            span,
            formatdoc! {
                r#"
                    It is not allowed to define inline "use cache" annotated class instance methods.
                    To define cached functions, use functions, object method properties, or static class methods instead.
                "#
            },
        ),
        ServerActionsErrorKind::InlineUseCacheInClientComponent { span } => (
            span,
            formatdoc! {
                r#"
                    It is not allowed to define inline "use cache" annotated functions in Client Components.
                    To use "use cache" functions in a Client Component, you can either export them from a separate file with "use cache" or "use server" at the top, or pass them down through props from a Server Component.
                "#
            },
        ),
        ServerActionsErrorKind::InlineUseServerInClassInstanceMethod { span } => (
            span,
            formatdoc! {
                r#"
                    It is not allowed to define inline "use server" annotated class instance methods.
                    To define Server Actions, use functions, object method properties, or static class methods instead.
                "#
            },
        ),
        ServerActionsErrorKind::InlineUseServerInClientComponent { span } => (
            span,
            formatdoc! {
                r#"
                    It is not allowed to define inline "use server" annotated Server Actions in Client Components.
                    To use Server Actions in a Client Component, you can either export them from a separate file with "use server" at the top, or pass them down through props from a Server Component.

                    Read more: https://nextjs.org/docs/app/api-reference/functions/server-actions#with-client-components
                "#
            },
        ),
        ServerActionsErrorKind::InlineSyncFunction { span, directive } => (
            span,
            formatdoc! {
                r#"
                    {subject} must be async functions.
                "#,
                subject = if let Directive::UseServer = directive {
                    "Server Actions"
                } else {
                    "\"use cache\" functions"
                }
            },
        ),
        ServerActionsErrorKind::MisplacedDirective {
            span,
            directive,
            location,
        } => (
            span,
            formatdoc! {
                r#"
                    The "{directive}" directive must be at the top of the {location}.
                "#,
                location = match location {
                    DirectiveLocation::Module => "file",
                    DirectiveLocation::FunctionBody => "function body",
                }
            },
        ),
        ServerActionsErrorKind::MisplacedWrappedDirective {
            span,
            directive,
            location,
        } => (
            span,
            formatdoc! {
                r#"
                    The "{directive}" directive must be at the top of the {location}, and cannot be wrapped in parentheses.
                "#,
                location = match location {
                    DirectiveLocation::Module => "file",
                    DirectiveLocation::FunctionBody => "function body",
                }
            },
        ),
        ServerActionsErrorKind::MisspelledDirective {
            span,
            directive,
            expected_directive,
        } => (
            span,
            formatdoc! {
                r#"
                    Did you mean "{expected_directive}"? "{directive}" is not a supported directive name."
                "#
            },
        ),
        ServerActionsErrorKind::MultipleDirectives { span, location } => (
            span,
            formatdoc! {
                r#"
                    Conflicting directives "use server" and "use cache" found in the same {location}. You cannot place both directives at the top of a {location}. Please remove one of them.
                "#,
                location = match location {
                    DirectiveLocation::Module => "file",
                    DirectiveLocation::FunctionBody => "function body",
                }
            },
        ),
        ServerActionsErrorKind::UnknownCacheKind { span, cache_kind } => (
            span,
            formatdoc! {
                r#"
                    Unknown cache kind "{cache_kind}". Please configure a cache handler for this kind in the "experimental.cacheHandlers" object in your Next.js config.
                "#
            },
        ),
        ServerActionsErrorKind::UseCacheWithoutExperimentalFlag { span, directive } => (
            span,
            formatdoc! {
                r#"
                    To use "{directive}", please enable the experimental feature flag "useCache" in your Next.js config.

                    Read more: https://nextjs.org/docs/canary/app/api-reference/directives/use-cache#usage
                "#
            },
        ),
        ServerActionsErrorKind::WrappedDirective { span, directive } => (
            span,
            formatdoc! {
                r#"
                    The "{directive}" directive cannot be wrapped in parentheses.
                "#
            },
        ),
    };

    HANDLER.with(|handler| handler.struct_span_err(span, &msg).emit());
}
