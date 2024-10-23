use std::{
    collections::{BTreeMap, HashSet},
    convert::{TryFrom, TryInto},
    mem::take,
};

use hex::encode as hex_encode;
use serde::Deserialize;
use sha1::{Digest, Sha1};
use swc_core::{
    common::{
        comments::{Comment, CommentKind, Comments},
        errors::HANDLER,
        util::take::Take,
        BytePos, FileName, Mark, Span, SyntaxContext, DUMMY_SP,
    },
    ecma::{
        ast::*,
        atoms::JsWord,
        utils::{private_ident, quote_ident, ExprFactory},
        visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
    },
};

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {
    pub is_react_server_layer: bool,
    pub enabled: bool,
    pub hash_salt: String,
}

/// A mapping of hashed action id to the action's exported function name.
// Using BTreeMap to ensure the order of the actions is deterministic.
pub type ActionsMap = BTreeMap<String, String>;

#[tracing::instrument(level = tracing::Level::TRACE, skip_all)]
pub fn server_actions<C: Comments>(
    file_name: &FileName,
    config: Config,
    comments: C,
) -> impl VisitMut + Fold {
    as_folder(ServerActions {
        config,
        comments,
        file_name: file_name.to_string(),
        start_pos: BytePos(0),
        in_action_file: false,
        in_cache_file: None,
        in_exported_expr: false,
        in_default_export_decl: false,
        in_callee: false,
        has_action: false,
        has_cache: false,

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
        exported_local_ids: HashSet::new(),
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
    in_action_file: bool,
    in_cache_file: Option<String>,
    in_exported_expr: bool,
    in_default_export_decl: bool,
    in_callee: bool,
    has_action: bool,
    has_cache: bool,

    reference_index: u32,
    in_module_level: bool,
    should_track_names: bool,

    names: Vec<Name>,
    declared_idents: Vec<Ident>,

    // This flag allows us to rewrite `function foo() {}` to `const foo = createProxy(...)`.
    rewrite_fn_decl_to_proxy_decl: Option<VarDecl>,
    rewrite_default_fn_expr_to_proxy_expr: Option<Box<Expr>>,
    rewrite_expr_to_proxy_expr: Option<Box<Expr>>,

    // (ident, export name)
    exported_idents: Vec<(Ident, String)>,

    annotations: Vec<Stmt>,
    extra_items: Vec<ModuleItem>,
    hoisted_extra_items: Vec<ModuleItem>,
    export_actions: Vec<String>,

    private_ctxt: SyntaxContext,

    arrow_or_fn_expr_ident: Option<Ident>,
    exported_local_ids: HashSet<Id>,
}

impl<C: Comments> ServerActions<C> {
    // Check if the function or arrow function is an action or cache function
    fn get_body_info(&mut self, maybe_body: Option<&mut BlockStmt>) -> (bool, Option<String>) {
        let mut is_action_fn = false;
        let mut cache_type = None;

        // Even if it's a file-level action or cache module, the function body
        // might still have directives that override the module-level annotations.

        // Check if the function has a directive.
        if let Some(body) = maybe_body {
            let mut span = None;
            remove_server_directive_index_in_fn(
                &mut body.stmts,
                &mut is_action_fn,
                &mut cache_type,
                &mut span,
                self.config.enabled,
            );

            if !self.config.is_react_server_layer {
                if is_action_fn && !self.in_action_file {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                span.unwrap_or(body.span),
                                "It is not allowed to define inline \"use server\" annotated \
                                 Server Actions in Client Components.\nTo use Server Actions in a \
                                 Client Component, you can either export them from a separate \
                                 file with \"use server\" at the top, or pass them down through \
                                 props from a Server Component.\n\n\
                                 Read more: https://nextjs.org/docs/app/api-reference/functions/server-actions#with-client-components\n",
                            )
                            .emit()
                    });
                }

                if cache_type.is_some() && self.in_cache_file.is_none() && !self.in_action_file {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                span.unwrap_or(body.span),
                                "It is not allowed to define inline \"use cache\" annotated \
                                 functions in Client Components.\nTo use \"use cache\" functions \
                                 in a Client Component, you can either export them from a \
                                 separate file with \"use cache\" or \"use server\" at the top, \
                                 or pass them down through props from a Server Component.\n",
                            )
                            .emit()
                    });
                }
            }
        }

        if self.in_exported_expr {
            if self.in_action_file {
                // All export functions in a server file are actions
                is_action_fn = true;
            } else if let Some(cache_file_type) = &self.in_cache_file {
                // All export functions in a cache file are cache functions
                cache_type = Some(cache_file_type.clone());
            }
        }

        (is_action_fn, cache_type)
    }

    fn maybe_hoist_and_create_proxy_for_server_action_arrow_expr(
        &mut self,
        ids_from_closure: Vec<Name>,
        arrow: &mut ArrowExpr,
    ) -> Box<Expr> {
        let action_name = gen_action_ident(&mut self.reference_index).to_string();

        self.has_action = true;
        self.export_actions.push(action_name.to_string());

        let action_ident = Ident::new(action_name.clone().into(), arrow.span, self.private_ctxt);
        let action_id = generate_action_id(
            &self.config.hash_salt,
            &self.file_name,
            action_name.to_string().as_str(),
        );

        let register_action_expr = bind_args_to_ref_expr(
            annotate_ident_as_server_reference(action_ident.clone(), action_id.clone(), arrow.span),
            ids_from_closure
                .iter()
                .cloned()
                .map(|id| Some(id.as_arg()))
                .collect(),
            action_id,
        );

        if let BlockStmtOrExpr::BlockStmt(block) = &mut *arrow.body {
            block.visit_mut_with(&mut ClosureReplacer {
                used_ids: &ids_from_closure,
                private_ctxt: self.private_ctxt,
            });
        }

        // export const $ACTION_myAction = async () => {}
        let mut new_params: Vec<Param> = vec![];
        let mut new_body: BlockStmtOrExpr = *arrow.body.clone();

        if !ids_from_closure.is_empty() {
            // First argument is the encrypted closure variables
            new_params.push(Param {
                span: DUMMY_SP,
                decorators: vec![],
                pat: Pat::Ident(IdentName::new("$$ACTION_CLOSURE_BOUND".into(), DUMMY_SP).into()),
            });

            // Also prepend the decryption decl into the body.
            // var [arg1, arg2, arg3] = await decryptActionBoundArgs(actionId,
            // $$ACTION_CLOSURE_BOUND)
            let mut pats = vec![];
            for i in 0..ids_from_closure.len() {
                pats.push(Some(Pat::Ident(
                    Ident::new(
                        format!("$$ACTION_ARG_{i}").into(),
                        DUMMY_SP,
                        self.private_ctxt,
                    )
                    .into(),
                )));
            }
            let decryption_decl = VarDecl {
                span: DUMMY_SP,
                kind: VarDeclKind::Var,
                declare: false,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: Pat::Array(ArrayPat {
                        span: DUMMY_SP,
                        elems: pats,
                        optional: false,
                        type_ann: None,
                    }),
                    init: Some(Box::new(Expr::Await(AwaitExpr {
                        span: DUMMY_SP,
                        arg: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: quote_ident!("decryptActionBoundArgs").as_callee(),
                            args: vec![
                                generate_action_id(
                                    &self.config.hash_salt,
                                    &self.file_name,
                                    &action_name,
                                )
                                .as_arg(),
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

        for p in arrow.params.iter() {
            new_params.push(Param {
                span: DUMMY_SP,
                decorators: vec![],
                pat: p.clone(),
            });
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
        function: &mut Box<Function>,
        fn_name: Option<Ident>,
    ) -> Box<Expr> {
        let action_name: JsWord = gen_action_ident(&mut self.reference_index);

        self.has_action = true;
        self.export_actions.push(action_name.to_string());

        let action_ident = Ident::new(action_name.clone(), function.span, self.private_ctxt);
        let action_id = generate_action_id(&self.config.hash_salt, &self.file_name, &action_name);

        let register_action_expr = bind_args_to_ref_expr(
            annotate_ident_as_server_reference(
                action_ident.clone(),
                action_id.clone(),
                function.span,
            ),
            ids_from_closure
                .iter()
                .cloned()
                .map(|id| Some(id.as_arg()))
                .collect(),
            action_id,
        );

        function.body.visit_mut_with(&mut ClosureReplacer {
            used_ids: &ids_from_closure,
            private_ctxt: self.private_ctxt,
        });

        // export async function $ACTION_myAction () {}
        let mut new_params: Vec<Param> = vec![];
        let mut new_body: Option<BlockStmt> = function.body.clone();

        // add params from closure collected ids
        if !ids_from_closure.is_empty() {
            // First argument is the encrypted closure variables
            new_params.push(Param {
                span: DUMMY_SP,
                decorators: vec![],
                pat: Pat::Ident(IdentName::new("$$ACTION_CLOSURE_BOUND".into(), DUMMY_SP).into()),
            });

            // Also prepend the decryption decl into the body.
            // var [arg1, arg2, arg3] = await decryptActionBoundArgs(actionId,
            // $$ACTION_CLOSURE_BOUND)
            let mut pats = vec![];
            for i in 0..ids_from_closure.len() {
                pats.push(Some(Pat::Ident(
                    Ident::new(
                        format!("$$ACTION_ARG_{i}").into(),
                        DUMMY_SP,
                        self.private_ctxt,
                    )
                    .into(),
                )));
            }
            let decryption_decl = VarDecl {
                span: DUMMY_SP,
                kind: VarDeclKind::Var,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: Pat::Array(ArrayPat {
                        span: DUMMY_SP,
                        elems: pats,
                        optional: false,
                        type_ann: None,
                    }),
                    init: Some(Box::new(Expr::Await(AwaitExpr {
                        span: DUMMY_SP,
                        arg: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: quote_ident!("decryptActionBoundArgs").as_callee(),
                            args: vec![
                                generate_action_id(
                                    &self.config.hash_salt,
                                    &self.file_name,
                                    &action_name,
                                )
                                .as_arg(),
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

        for p in function.params.iter() {
            new_params.push(p.clone());
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
                                ..*function.take()
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
        cache_type: &str,
        arrow: &mut ArrowExpr,
    ) -> Box<Expr> {
        let cache_name: JsWord = gen_cache_ident(&mut self.reference_index);
        let cache_ident = private_ident!(cache_name.clone());
        let export_name: JsWord = cache_name;

        self.has_cache = true;
        self.has_action = true;
        self.export_actions.push(export_name.to_string());

        let reference_id =
            generate_action_id(&self.config.hash_salt, &self.file_name, &export_name);

        if let BlockStmtOrExpr::BlockStmt(block) = &mut *arrow.body {
            block.visit_mut_with(&mut ClosureReplacer {
                used_ids: &ids_from_closure,
                private_ctxt: self.private_ctxt,
            });
        }

        // export const $ACTION_myAction = async () => {}
        let mut new_params: Vec<Param> = vec![];
        let mut new_body: BlockStmtOrExpr = *arrow.body.take();

        if !ids_from_closure.is_empty() {
            // First argument is the encrypted closure variables
            new_params.push(Param {
                span: DUMMY_SP,
                decorators: vec![],
                pat: Pat::Ident(IdentName::new("$$ACTION_CLOSURE_BOUND".into(), DUMMY_SP).into()),
            });

            // Also prepend the decryption decl into the body.
            // var [arg1, arg2, arg3] = await decryptActionBoundArgs(actionId,
            // $$ACTION_CLOSURE_BOUND)
            let mut pats = vec![];
            for i in 0..ids_from_closure.len() {
                pats.push(Some(Pat::Ident(
                    Ident::new(
                        format!("$$ACTION_ARG_{i}").into(),
                        DUMMY_SP,
                        self.private_ctxt,
                    )
                    .into(),
                )));
            }
            let decryption_decl = VarDecl {
                span: DUMMY_SP,
                kind: VarDeclKind::Var,
                declare: false,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: Pat::Array(ArrayPat {
                        span: DUMMY_SP,
                        elems: pats,
                        optional: false,
                        type_ann: None,
                    }),
                    init: Some(Box::new(Expr::Await(AwaitExpr {
                        span: DUMMY_SP,
                        arg: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: quote_ident!("decryptActionBoundArgs").as_callee(),
                            args: vec![
                                generate_action_id(
                                    &self.config.hash_salt,
                                    &self.file_name,
                                    &export_name,
                                )
                                .as_arg(),
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

        for p in arrow.params.iter() {
            new_params.push(Param {
                span: DUMMY_SP,
                decorators: vec![],
                pat: p.clone(),
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
                        span: DUMMY_SP,
                        name: Pat::Ident(cache_ident.clone().into()),
                        init: Some(wrap_cache_expr(
                            Box::new(Expr::Fn(FnExpr {
                                ident: None,
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
                            })),
                            cache_type,
                            &reference_id,
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
        );

        // If there're any bound args from the closure, we need to hoist the
        // register action expression to the top-level, and return the bind
        // expression inline.
        if !bound_args.is_empty() {
            let ref_ident = private_ident!(gen_ref_ident(&mut self.reference_index));

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
        cache_type: &str,
        function: &mut Box<Function>,
    ) -> Box<Expr> {
        let cache_name: JsWord = gen_cache_ident(&mut self.reference_index);
        let cache_ident = private_ident!(cache_name.clone());

        self.has_cache = true;
        self.has_action = true;
        self.export_actions.push(cache_name.to_string());

        let reference_id = generate_action_id(&self.config.hash_salt, &self.file_name, &cache_name);

        let register_action_expr = annotate_ident_as_server_reference(
            cache_ident.clone(),
            reference_id.clone(),
            function.span,
        );

        function.body.visit_mut_with(&mut ClosureReplacer {
            used_ids: &ids_from_closure,
            private_ctxt: self.private_ctxt,
        });

        // export async function $ACTION_myAction () {}
        let mut new_params: Vec<Param> = vec![];
        let mut new_body: Option<BlockStmt> = function.body.clone();

        // add params from closure collected ids
        if !ids_from_closure.is_empty() {
            // First argument is the encrypted closure variables
            new_params.push(Param {
                span: DUMMY_SP,
                decorators: vec![],
                pat: Pat::Ident(IdentName::new("$$ACTION_CLOSURE_BOUND".into(), DUMMY_SP).into()),
            });

            // Also prepend the decryption decl into the body.
            // var [arg1, arg2, arg3] = await decryptActionBoundArgs(actionId,
            // $$ACTION_CLOSURE_BOUND)
            let mut pats = vec![];
            for i in 0..ids_from_closure.len() {
                pats.push(Some(Pat::Ident(
                    Ident::new(
                        // $$ACTION_ARG_0
                        format!("$$ACTION_ARG_{i}").into(),
                        DUMMY_SP,
                        self.private_ctxt,
                    )
                    .into(),
                )));
            }
            let decryption_decl = VarDecl {
                span: DUMMY_SP,
                kind: VarDeclKind::Var,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: Pat::Array(ArrayPat {
                        span: DUMMY_SP,
                        elems: pats,
                        optional: false,
                        type_ann: None,
                    }),
                    init: Some(Box::new(Expr::Await(AwaitExpr {
                        span: DUMMY_SP,
                        arg: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: quote_ident!("decryptActionBoundArgs").as_callee(),
                            args: vec![
                                generate_action_id(
                                    &self.config.hash_salt,
                                    &self.file_name,
                                    &cache_name,
                                )
                                .as_arg(),
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

        for p in function.params.iter() {
            new_params.push(p.clone());
        }

        // export var cache_ident = async function() {}
        self.hoisted_extra_items
            .push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                span: DUMMY_SP,
                decl: VarDecl {
                    span: DUMMY_SP,
                    kind: VarDeclKind::Var,
                    decls: vec![VarDeclarator {
                        span: DUMMY_SP,
                        name: Pat::Ident(cache_ident.clone().into()),
                        init: Some(wrap_cache_expr(
                            Box::new(Expr::Fn(FnExpr {
                                ident: fn_name.clone(),
                                function: Box::new(Function {
                                    params: new_params,
                                    body: new_body,
                                    ..*function.take()
                                }),
                            })),
                            cache_type,
                            &reference_id,
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
            let ref_ident = private_ident!(gen_ref_ident(&mut self.reference_index));

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
        let old = self.in_exported_expr;
        self.in_exported_expr = true;
        decl.decl.visit_mut_with(self);
        self.in_exported_expr = old;
    }

    fn visit_mut_export_default_decl(&mut self, decl: &mut ExportDefaultDecl) {
        let old = self.in_exported_expr;
        let old_default = self.in_default_export_decl;
        self.in_exported_expr = true;
        self.in_default_export_decl = true;
        self.rewrite_default_fn_expr_to_proxy_expr = None;
        decl.decl.visit_mut_with(self);
        self.in_exported_expr = old;
        self.in_default_export_decl = old_default;
    }

    fn visit_mut_export_default_expr(&mut self, expr: &mut ExportDefaultExpr) {
        let old = self.in_exported_expr;
        let old_default = self.in_default_export_decl;
        self.in_exported_expr = true;
        self.in_default_export_decl = true;
        expr.expr.visit_mut_with(self);
        self.in_exported_expr = old;
        self.in_default_export_decl = old_default;
    }

    fn visit_mut_fn_expr(&mut self, f: &mut FnExpr) {
        let (is_action_fn, cache_type) = self.get_body_info(f.function.body.as_mut());

        let declared_idents_until = self.declared_idents.len();
        let current_names = take(&mut self.names);

        // Visit children
        {
            let old_in_module = self.in_module_level;
            let old_should_track_names = self.should_track_names;
            let old_in_exported_expr = self.in_exported_expr;
            let old_in_default_export_decl = self.in_default_export_decl;
            self.in_module_level = false;
            self.should_track_names =
                is_action_fn || cache_type.is_some() || self.should_track_names;
            self.in_exported_expr = false;
            self.in_default_export_decl = false;
            f.visit_mut_children_with(self);
            self.in_module_level = old_in_module;
            self.should_track_names = old_should_track_names;
            self.in_exported_expr = old_in_exported_expr;
            self.in_default_export_decl = old_in_default_export_decl;
        }

        let mut child_names = if self.should_track_names {
            let names = take(&mut self.names);
            self.names = current_names;
            self.names.extend(names.iter().cloned());
            names
        } else {
            take(&mut self.names)
        };

        if (is_action_fn || cache_type.is_some()) && !f.function.is_async {
            HANDLER.with(|handler| {
                let subject = if is_action_fn {
                    "Server Actions"
                } else {
                    "\"use cache\" functions"
                };

                handler
                    .struct_span_err(
                        f.function.span,
                        &format!("{subject} must be async functions."),
                    )
                    .emit();
            });

            return;
        }

        if !is_action_fn && cache_type.is_none() || !self.config.is_react_server_layer {
            return;
        }

        if let Some(cache_type_str) = cache_type {
            // Collect all the identifiers defined inside the closure and used
            // in the cache function. With deduplication.
            retain_names_from_declared_idents(
                &mut child_names,
                &self.declared_idents[..declared_idents_until],
            );

            let new_expr = self.maybe_hoist_and_create_proxy_for_cache_function(
                child_names.clone(),
                f.ident.clone().or(self.arrow_or_fn_expr_ident.clone()),
                cache_type_str.as_str(),
                &mut f.function,
            );

            if self.in_default_export_decl {
                // This function expression is also the default export:
                // `export default async function() {}`
                // This specific case (default export) isn't handled by `visit_mut_expr`.
                // Replace the original function expr with a action proxy expr.
                self.rewrite_default_fn_expr_to_proxy_expr = Some(new_expr);
            } else {
                self.rewrite_expr_to_proxy_expr = Some(new_expr);
            }
        }

        if is_action_fn && !(self.in_action_file && self.in_exported_expr) {
            // Collect all the identifiers defined inside the closure and used
            // in the action function. With deduplication.
            retain_names_from_declared_idents(
                &mut child_names,
                &self.declared_idents[..declared_idents_until],
            );

            let new_expr = self.maybe_hoist_and_create_proxy_for_server_action_function(
                child_names,
                &mut f.function,
                f.ident.clone().or(self.arrow_or_fn_expr_ident.clone()),
            );

            if self.in_default_export_decl {
                // This function expression is also the default export:
                // `export default async function() {}`
                // This specific case (default export) isn't handled by `visit_mut_expr`.
                // Replace the original function expr with a action proxy expr.
                self.rewrite_default_fn_expr_to_proxy_expr = Some(new_expr);
            } else {
                self.rewrite_expr_to_proxy_expr = Some(new_expr);
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
        let old_in_exported_expr = self.in_exported_expr;

        if self.in_module_level && self.exported_local_ids.contains(&f.ident.to_id()) {
            self.in_exported_expr = true
        }

        let (is_action_fn, cache_type) = self.get_body_info(f.function.body.as_mut());

        let declared_idents_until = self.declared_idents.len();
        let current_names = take(&mut self.names);

        {
            // Visit children
            let old_in_module = self.in_module_level;
            let old_should_track_names = self.should_track_names;
            let old_in_exported_expr = self.in_exported_expr;
            let old_in_default_export_decl = self.in_default_export_decl;
            self.in_module_level = false;
            self.should_track_names =
                is_action_fn || cache_type.is_some() || self.should_track_names;
            self.in_exported_expr = false;
            self.in_default_export_decl = false;
            f.visit_mut_children_with(self);
            self.in_module_level = old_in_module;
            self.should_track_names = old_should_track_names;
            self.in_exported_expr = old_in_exported_expr;
            self.in_default_export_decl = old_in_default_export_decl;
        }

        if !is_action_fn && cache_type.is_none() || !self.config.is_react_server_layer {
            self.in_exported_expr = old_in_exported_expr;

            return;
        }

        let mut child_names = if self.should_track_names {
            let names = take(&mut self.names);
            self.names = current_names;
            self.names.extend(names.iter().cloned());
            names
        } else {
            take(&mut self.names)
        };

        if let Some(cache_type_str) = cache_type {
            if !f.function.is_async {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(
                            f.ident.span,
                            "\"use cache\" functions must be async functions.",
                        )
                        .emit();
                });

                self.in_exported_expr = old_in_exported_expr;

                return;
            }

            // Collect all the identifiers defined inside the closure and used
            // in the cache function. With deduplication.
            retain_names_from_declared_idents(
                &mut child_names,
                &self.declared_idents[..declared_idents_until],
            );

            let new_expr = self.maybe_hoist_and_create_proxy_for_cache_function(
                child_names,
                Some(f.ident.clone()),
                cache_type_str.as_str(),
                &mut f.function,
            );

            // Replace the original function declaration with a cache decl.
            self.rewrite_fn_decl_to_proxy_decl = Some(VarDecl {
                span: DUMMY_SP,
                kind: VarDeclKind::Var,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: Pat::Ident(f.ident.clone().into()),
                    init: Some(new_expr),
                    definite: false,
                }],
                ..Default::default()
            });
        } else if is_action_fn {
            if !f.function.is_async {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(f.ident.span, "Server Actions must be async functions")
                        .emit();
                });
            }

            if !(self.in_action_file && self.in_exported_expr) {
                // Collect all the identifiers defined inside the closure and used
                // in the action function. With deduplication.
                retain_names_from_declared_idents(
                    &mut child_names,
                    &self.declared_idents[..declared_idents_until],
                );

                let new_expr = self.maybe_hoist_and_create_proxy_for_server_action_function(
                    child_names,
                    &mut f.function,
                    Some(f.ident.clone()),
                );

                // Replace the original function declaration with a action proxy declaration
                // expr.
                self.rewrite_fn_decl_to_proxy_decl = Some(VarDecl {
                    span: DUMMY_SP,
                    kind: VarDeclKind::Var,
                    decls: vec![VarDeclarator {
                        span: DUMMY_SP,
                        name: Pat::Ident(f.ident.clone().into()),
                        init: Some(new_expr),
                        definite: false,
                    }],
                    ..Default::default()
                });
            }
        }

        self.in_exported_expr = old_in_exported_expr;
    }

    fn visit_mut_method_prop(&mut self, m: &mut MethodProp) {
        let old_in_exported_expr = self.in_exported_expr;
        let old_in_default_export_decl = self.in_default_export_decl;
        self.in_exported_expr = false;
        self.in_default_export_decl = false;
        m.visit_mut_children_with(self);
        self.in_exported_expr = old_in_exported_expr;
        self.in_default_export_decl = old_in_default_export_decl;
    }

    fn visit_mut_class_method(&mut self, m: &mut ClassMethod) {
        let old_in_exported_expr = self.in_exported_expr;
        let old_in_default_export_decl = self.in_default_export_decl;
        self.in_exported_expr = false;
        self.in_default_export_decl = false;
        m.visit_mut_children_with(self);
        self.in_exported_expr = old_in_exported_expr;
        self.in_default_export_decl = old_in_default_export_decl;
    }

    fn visit_mut_arrow_expr(&mut self, a: &mut ArrowExpr) {
        // Arrow expressions need to be visited in prepass to determine if it's
        // an action function or not.
        let (is_action_fn, cache_type) =
            self.get_body_info(if let BlockStmtOrExpr::BlockStmt(block) = &mut *a.body {
                Some(block)
            } else {
                None
            });

        let declared_idents_until = self.declared_idents.len();
        let current_names = take(&mut self.names);

        {
            // Visit children
            let old_in_module = self.in_module_level;
            let old_should_track_names = self.should_track_names;
            let old_in_exported_expr = self.in_exported_expr;
            let old_in_default_export_decl = self.in_default_export_decl;
            self.in_module_level = false;
            self.should_track_names =
                is_action_fn || cache_type.is_some() || self.should_track_names;
            self.in_exported_expr = false;
            self.in_default_export_decl = false;
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

        let mut child_names = if self.should_track_names {
            let names = take(&mut self.names);
            self.names = current_names;
            self.names.extend(names.iter().cloned());
            names
        } else {
            take(&mut self.names)
        };

        if !a.is_async && (is_action_fn || cache_type.is_some()) {
            HANDLER.with(|handler| {
                let subject = if is_action_fn {
                    "Server Actions"
                } else {
                    "\"use cache\" functions"
                };

                handler
                    .struct_span_err(a.span, &format!("{subject} must be async functions."))
                    .emit();
            });

            return;
        }

        if !is_action_fn && cache_type.is_none() || !self.config.is_react_server_layer {
            return;
        }

        // Collect all the identifiers defined inside the closure and used
        // in the action function. With deduplication.
        retain_names_from_declared_idents(
            &mut child_names,
            &self.declared_idents[..declared_idents_until],
        );

        let maybe_new_expr = if is_action_fn && !self.in_action_file {
            Some(self.maybe_hoist_and_create_proxy_for_server_action_arrow_expr(child_names, a))
        } else {
            cache_type.map(|cache_type_str| {
                self.maybe_hoist_and_create_proxy_for_cache_arrow_expr(
                    child_names,
                    cache_type_str.as_str(),
                    a,
                )
            })
        };

        self.rewrite_expr_to_proxy_expr = maybe_new_expr;
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
        let old_arrow_expr_ident = self.arrow_or_fn_expr_ident.take();

        if let PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(ident_name),
            value: box Expr::Arrow(_) | box Expr::Fn(_),
            ..
        })) = n
        {
            self.arrow_or_fn_expr_ident = Some(ident_name.clone().into());
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
        self.arrow_or_fn_expr_ident = old_arrow_expr_ident
    }

    fn visit_mut_callee(&mut self, n: &mut Callee) {
        let old_in_callee = self.in_callee;
        self.in_callee = true;
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
        if let Some(expr) = &self.rewrite_expr_to_proxy_expr {
            *n = (**expr).clone();
            self.rewrite_expr_to_proxy_expr = None;
        }
    }

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        remove_server_directive_index_in_module(
            stmts,
            &mut self.in_action_file,
            &mut self.in_cache_file,
            &mut self.has_action,
            &mut self.has_cache,
            self.config.enabled,
        );

        // If we're in a "use cache" file, collect all original IDs from export
        // specifiers in a pre-pass so that we know which functions are
        // exported, e.g. for this case:
        // ```
        // "use cache"
        // function foo() {}
        // function Bar() {}
        // export { foo }
        // export default Bar
        // ```
        if self.in_cache_file.is_some() {
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

        let old_annotations = self.annotations.take();
        let mut new = Vec::with_capacity(stmts.len());

        for mut stmt in stmts.take() {
            // For server boundary files, it's not allowed to export things other than async
            // functions.
            if self.in_action_file || self.in_cache_file.is_some() {
                let mut disallowed_export_span = DUMMY_SP;

                // Currently only function exports are allowed.
                match &mut stmt {
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl { decl, span })) => {
                        match decl {
                            Decl::Fn(f) => {
                                // export function foo() {}
                                self.exported_idents
                                    .push((f.ident.clone(), f.ident.sym.to_string()));
                            }
                            Decl::Var(var) => {
                                // export const foo = 1
                                let mut idents: Vec<Ident> = Vec::new();
                                collect_idents_in_var_decls(&var.decls, &mut idents);
                                self.exported_idents.extend(
                                    idents
                                        .into_iter()
                                        .map(|ident| (ident.clone(), ident.to_id().0.to_string())),
                                );

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
                                            self.exported_idents
                                                .push((ident.clone(), sym.to_string()));
                                        } else if let ModuleExportName::Str(str) = export_name {
                                            // export { foo as "bar" }
                                            self.exported_idents
                                                .push((ident.clone(), str.value.to_string()));
                                        }
                                    } else {
                                        // export { foo }
                                        self.exported_idents
                                            .push((ident.clone(), ident.sym.to_string()));
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
                            if let Some(ident) = &f.ident {
                                // export default function foo() {}
                                self.exported_idents.push((ident.clone(), "default".into()));
                            } else {
                                // export default function() {}
                                // Use the span from the function expression
                                let span = f.function.span;

                                let new_ident = Ident::new(
                                    gen_action_ident(&mut self.reference_index),
                                    span,
                                    self.private_ctxt,
                                );

                                f.ident = Some(new_ident.clone());

                                self.exported_idents
                                    .push((new_ident.clone(), "default".into()));

                                assign_name_to_ident(&new_ident, "default", &mut self.extra_items);
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

                                let new_ident = Ident::new(
                                    gen_action_ident(&mut self.reference_index),
                                    span,
                                    self.private_ctxt,
                                );

                                self.exported_idents
                                    .push((new_ident.clone(), "default".into()));

                                create_var_declarator(&new_ident, &mut self.extra_items);
                                assign_name_to_ident(&new_ident, "default", &mut self.extra_items);

                                *default_expr.expr =
                                    assign_arrow_expr(&new_ident, Expr::Arrow(arrow.clone()));
                            }
                            Expr::Ident(ident) => {
                                // export default foo
                                self.exported_idents.push((ident.clone(), "default".into()));
                            }
                            Expr::Call(call) => {
                                // export default fn()
                                // Determining a useful span here is tricky.
                                let span = call.span;

                                let new_ident = Ident::new(
                                    gen_action_ident(&mut self.reference_index),
                                    span,
                                    self.private_ctxt,
                                );

                                self.exported_idents
                                    .push((new_ident.clone(), "default".into()));

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
                    HANDLER.with(|handler| {
                        let directive = if self.in_action_file {
                            "\"use server\""
                        } else {
                            "\"use cache\""
                        };

                        handler
                            .struct_span_err(
                                disallowed_export_span,
                                &format!(
                                    "Only async functions are allowed to be exported in a \
                                     {directive} file."
                                ),
                            )
                            .emit();
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

            if self.config.is_react_server_layer
                || (!self.in_action_file && self.in_cache_file.is_none())
            {
                new.append(&mut self.hoisted_extra_items);
                new.push(new_stmt);
                new.extend(self.annotations.drain(..).map(ModuleItem::Stmt));
                new.append(&mut self.extra_items);
            }
        }

        // If it's compiled in the client layer, each export field needs to be
        // wrapped by a reference creation call.
        let create_ref_ident = private_ident!("createServerReference");
        let call_server_ident = private_ident!("callServer");
        let find_source_map_url_ident = private_ident!("findSourceMapURL");

        if (self.in_action_file || self.in_cache_file.is_some())
            && !self.config.is_react_server_layer
        {
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
        if self.in_action_file || self.in_cache_file.is_some() {
            for (ident, export_name) in self.exported_idents.iter() {
                if !self.config.is_react_server_layer {
                    let action_id =
                        generate_action_id(&self.config.hash_salt, &self.file_name, export_name);

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
                                        action_id.as_arg(),
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
                                            IdentName::new(export_name.clone().into(), ident.span)
                                                .into(),
                                        ),
                                        init: Some(Box::new(Expr::Call(CallExpr {
                                            span: call_expr_span,
                                            callee: Callee::Expr(Box::new(Expr::Ident(
                                                create_ref_ident.clone(),
                                            ))),
                                            args: vec![
                                                action_id.as_arg(),
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
                } else if self.in_cache_file.is_none() {
                    let action_id =
                        generate_action_id(&self.config.hash_salt, &self.file_name, export_name);

                    self.annotations.push(Stmt::Expr(ExprStmt {
                        span: DUMMY_SP,
                        expr: Box::new(annotate_ident_as_server_reference(
                            ident.clone(),
                            action_id,
                            ident.span,
                        )),
                    }));
                }
            }

            if self.config.is_react_server_layer {
                new.append(&mut self.extra_items);

                // For "use cache" files, there's no need to do extra annotations.
                if self.in_cache_file.is_none() && !self.exported_idents.is_empty() {
                    // Ensure that the exports are valid by appending a check
                    // import { ensureServerEntryExports } from 'private-next-rsc-action-validate'
                    // ensureServerEntryExports([action1, action2, ...])
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
                                        .map(|(ident, _span)| {
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
            let mut actions = self.export_actions.clone();

            // All exported values are considered as actions if the file is an action file.
            if self.in_action_file
                || self.in_cache_file.is_some() && !self.config.is_react_server_layer
            {
                actions.extend(self.exported_idents.iter().map(|e| e.1.clone()));
            };

            let actions = actions
                .into_iter()
                .map(|name| {
                    (
                        generate_action_id(&self.config.hash_salt, &self.file_name, &name),
                        name,
                    )
                })
                .collect::<ActionsMap>();
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

        // import { cache as $cache } from "private-next-rsc-cache-wrapper";
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
        let old_arrow_expr_ident = self.arrow_or_fn_expr_ident.take();

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

        self.arrow_or_fn_expr_ident = old_arrow_expr_ident
    }

    fn visit_mut_var_declarator(&mut self, var_declarator: &mut VarDeclarator) {
        let old_in_exported_expr = self.in_exported_expr;
        let old_arrow_expr_ident = self.arrow_or_fn_expr_ident.take();

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
        self.arrow_or_fn_expr_ident = old_arrow_expr_ident;
    }

    fn visit_mut_assign_expr(&mut self, assign_expr: &mut AssignExpr) {
        let old_arrow_expr_ident = self.arrow_or_fn_expr_ident.take();

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

        self.arrow_or_fn_expr_ident = old_arrow_expr_ident;
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

fn gen_action_ident(cnt: &mut u32) -> JsWord {
    let id: JsWord = format!("$$RSC_SERVER_ACTION_{cnt}").into();
    *cnt += 1;
    id
}

fn gen_cache_ident(cnt: &mut u32) -> JsWord {
    let id: JsWord = format!("$$RSC_SERVER_CACHE_{cnt}").into();
    *cnt += 1;
    id
}

fn gen_ref_ident(cnt: &mut u32) -> JsWord {
    let id: JsWord = format!("$$RSC_SERVER_REF_{cnt}").into();
    *cnt += 1;
    id
}

fn wrap_cache_expr(expr: Box<Expr>, name: &str, id: &str) -> Box<Expr> {
    // expr -> $$cache__("name", "id", expr)
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

fn generate_action_id(hash_salt: &str, file_name: &str, export_name: &str) -> String {
    // Attach a checksum to the action using sha1:
    // $$id = sha1('hash_salt' + 'file_name' + ':' + 'export_name');
    let mut hasher = Sha1::new();
    hasher.update(hash_salt.as_bytes());
    hasher.update(file_name.as_bytes());
    hasher.update(b":");
    hasher.update(export_name.as_bytes());
    let result = hasher.finalize();

    hex_encode(result)
}

fn annotate_ident_as_server_reference(
    ident: Ident,
    action_id: String,
    original_span: Span,
) -> Expr {
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

fn bind_args_to_ref_expr(expr: Expr, bound: Vec<Option<ExprOrSpread>>, action_id: String) -> Expr {
    if bound.is_empty() {
        expr
    } else {
        // expr.bind(null, [encryptActionBoundArgs("id", [arg1, ...])])
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
                        args: vec![
                            ExprOrSpread {
                                spread: None,
                                expr: Box::new(action_id.into()),
                            },
                            ExprOrSpread {
                                spread: None,
                                expr: Box::new(Expr::Array(ArrayLit {
                                    span: DUMMY_SP,
                                    elems: bound,
                                })),
                            },
                        ],
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

fn remove_server_directive_index_in_module(
    stmts: &mut Vec<ModuleItem>,
    in_action_file: &mut bool,
    in_cache_file: &mut Option<String>,
    has_action: &mut bool,
    has_cache: &mut bool,
    enabled: bool,
) {
    let mut is_directive = true;

    stmts.retain(|stmt| {
        match stmt {
            ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                expr: box Expr::Lit(Lit::Str(Str { value, span, .. })),
                ..
            })) => {
                if value == "use server" {
                    if is_directive {
                        *in_action_file = true;
                        *has_action = true;
                        if !enabled {
                            HANDLER.with(|handler| {
                                handler
                                    .struct_span_err(
                                        *span,
                                        "To use Server Actions, please enable the feature flag in your Next.js config. Read more: https://nextjs.org/docs/app/building-your-application/data-fetching/forms-and-mutations#convention",
                                    )
                                    .emit()
                            });
                        }
                        return false;
                    } else {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    "The \"use server\" directive must be at the top of the file.",
                                )
                                .emit();
                        });
                    }
                } else
                // `use cache` or `use cache: foo`
                if value == "use cache" || value.starts_with("use cache: ") {
                    if is_directive {
                        *in_cache_file = Some(
                            if value == "use cache" {
                                "default".into()
                            } else {
                                // Slice the value after "use cache: "
                                value.split_at(
                                    "use cache: ".len(),
                                ).1.into()
                            }
                        );
                        *has_cache = true;
                        return false;
                    } else {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    "The \"use cache\" directive must be at the top of the file.",
                                )
                                .emit();
                        });
                    }
                } else {
                    // Detect typo of "use cache"
                    if detect_similar_strings(value, "use cache") {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    format!(
                                        "Did you mean \"use cache\"? \"{value}\" is not a supported \
                                         directive name."
                                    )
                                    .as_str(),
                                )
                                .emit();
                        });
                    }
                }
            }
            ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                expr:
                    box Expr::Paren(ParenExpr {
                        expr: box Expr::Lit(Lit::Str(Str { value, .. })),
                        ..
                    }),
                span,
                ..
            })) => {
                // Match `("use server")`.
                if value == "use server" || detect_similar_strings(value, "use server") {
                    if is_directive {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    "The \"use server\" directive cannot be wrapped in \
                                     parentheses.",
                                )
                                .emit();
                        })
                    } else {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    "The \"use server\" directive must be at the top of the file, \
                                     and cannot be wrapped in parentheses.",
                                )
                                .emit();
                        })
                    }
                } else if value == "use cache" || detect_similar_strings(value, "use cache") {
                    if is_directive {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    "The \"use cache\" directive cannot be wrapped in \
                                     parentheses.",
                                )
                                .emit();
                        })
                    } else {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    "The \"use cache\" directive must be at the top of the file, \
                                     and cannot be wrapped in parentheses.",
                                )
                                .emit();
                        })
                    }
                }
            }
            _ => {
                is_directive = false;
            }
        }
        true
    });
}

fn remove_server_directive_index_in_fn(
    stmts: &mut Vec<Stmt>,
    is_action_fn: &mut bool,
    cache_type: &mut Option<String>,
    action_span: &mut Option<Span>,
    enabled: bool,
) {
    let mut is_directive = true;

    stmts.retain(|stmt| {
        if let Stmt::Expr(ExprStmt {
            expr: box Expr::Lit(Lit::Str(Str { value, span, .. })),
            ..
        }) = stmt
        {
            if value == "use server" {
                *action_span = Some(*span);

                if is_directive {
                    *is_action_fn = true;
                    if !enabled {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    "To use Server Actions, please enable the feature flag in your Next.js config. Read more: https://nextjs.org/docs/app/building-your-application/data-fetching/forms-and-mutations#convention",
                                )
                                .emit()
                        });
                    }
                    return false;
                } else {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                *span,
                                "The \"use server\" directive must be at the top of the function \
                                 body.",
                            )
                            .emit();
                    });
                }
            } else if detect_similar_strings(value, "use server") {
                    // Detect typo of "use server"
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                *span,
                                format!(
                                    "Did you mean \"use server\"? \"{value}\" is not a supported \
                                     directive name."
                                )
                                .as_str(),
                            )
                            .emit();
                    });
            } else if value == "use cache" || value.starts_with("use cache: ") {
                if is_directive {
                    *cache_type = Some(
                        if value == "use cache" {
                            "default".into()
                        } else {
                            // Slice the value after "use cache: "
                            value.split_at(
                                "use cache: ".len(),
                            ).1.into()
                        },
                    );
                    return false;
                } else {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                *span,
                                "The \"use cache\" directive must be at the top of the function \
                                 body.",
                            )
                            .emit();
                    });
                }
            } else if detect_similar_strings(value, "use cache") {
                // Detect typo of "use cache"
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(
                            *span,
                            format!(
                                "Did you mean \"use cache\"? \"{value}\" is not a supported \
                                 directive name."
                            )
                            .as_str(),
                        )
                        .emit();
                });
            }
        } else {
            is_directive = false;
        }
        true
    });
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
    if let Stmt::Decl(Decl::Var(var)) = &stmt {
        collect_idents_in_var_decls(&var.decls, idents);
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
    prop: JsWord,
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
