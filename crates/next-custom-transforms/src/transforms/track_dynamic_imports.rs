use serde::Deserialize;
use swc_core::{
    common::{comments::Comments, util::take::Take, Mark, Span, SyntaxContext},
    ecma::{
        ast::*,
        utils::{prepend_stmt, private_ident, quote_ident, quote_str},
        visit::{noop_visit_mut_type, visit_mut_pass, VisitMut, VisitMutWith},
    },
    quote,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {}

pub fn track_dynamic_imports<C: Comments>(
    unresolved_mark: Mark,
    comments: C,
) -> impl VisitMut + Pass {
    visit_mut_pass(ImportReplacer::new(unresolved_mark, comments))
}

struct ImportReplacer<C> {
    comments: C,
    unresolved_ctxt: SyntaxContext,
    has_dynamic_import: bool,
    wrapper_function_local_ident: Ident,
}

impl<C> ImportReplacer<C>
where
    C: Comments,
{
    pub fn new(unresolved_mark: Mark, comments: C) -> Self {
        ImportReplacer {
            comments,
            unresolved_ctxt: SyntaxContext::empty().apply_mark(unresolved_mark),
            has_dynamic_import: false,
            wrapper_function_local_ident: private_ident!("$$trackDynamicImport__"),
        }
    }
}

impl<C> VisitMut for ImportReplacer<C>
where
    C: Comments,
{
    noop_visit_mut_type!(); // TODO: what does this do?

    fn visit_mut_program(&mut self, program: &mut Program) {
        program.visit_mut_children_with(self);
        // if we wrapped a dynamic import while visiting the children, we need to import the wrapper

        if self.has_dynamic_import {
            let import_args = MakeNamedImportArgs {
                original_ident: quote_ident!("trackDynamicImport").into(),
                local_ident: self.wrapper_function_local_ident.clone(),
                source: "private-next-rsc-track-dynamic-import",
                unresolved_ctxt: self.unresolved_ctxt,
            };
            match program {
                Program::Module(module) => {
                    prepend_stmt(&mut module.body, make_named_import_esm(import_args));
                }
                Program::Script(script) => {
                    // CJS modules can still use `import()`. for CJS, we have to inject the helper
                    // using `require` instead of `import` to avoid accidentally turning them
                    // into ESM modules.
                    prepend_stmt(&mut script.body, make_named_import_cjs(import_args));
                }
            }
        }
    }

    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        expr.visit_mut_children_with(self);

        // before: `import(...)`
        // after:  `$$trackDynamicImport__(import(...))`

        if let Expr::Call(CallExpr {
            callee: Callee::Import(_),
            ..
        }) = expr
        {
            self.has_dynamic_import = true;
            let mut replacement_expr = quote!(
                "$wrapper_fn($expr)" as Expr,
                wrapper_fn = self.wrapper_function_local_ident.clone(),
                expr: Expr = expr.take()
            );
            // this call doesn't have any side effects, so add `/*#__PURE__*/`
            let replacement_expr_span = Span::dummy_with_cmt();
            replacement_expr.set_span(replacement_expr_span);
            self.comments.add_pure_comment(replacement_expr_span.lo);
            *expr = replacement_expr
        }
    }
}

struct MakeNamedImportArgs<'a> {
    original_ident: Ident,
    local_ident: Ident,
    source: &'a str,
    unresolved_ctxt: SyntaxContext,
}

fn make_named_import_esm(args: MakeNamedImportArgs) -> ModuleItem {
    let MakeNamedImportArgs {
        original_ident,
        local_ident,
        source,
        ..
    } = args;
    let mut item = quote!(
        "import { $original_ident as $local_ident } from 'dummy'" as ModuleItem,
        original_ident = original_ident,
        local_ident = local_ident,
    );
    // the import source cannot be parametrized in `quote!()`, so patch it manually
    let decl = item.as_mut_module_decl().unwrap().as_mut_import().unwrap();
    decl.src = Box::new(source.into());
    item
}

fn make_named_import_cjs(args: MakeNamedImportArgs) -> Stmt {
    let MakeNamedImportArgs {
        original_ident,
        local_ident,
        source,
        unresolved_ctxt,
    } = args;
    quote!(
        "const { [$original_name]: $local_ident } = $require($source)" as Stmt,
        original_name: Expr = quote_str!(original_ident.sym).into(),
        local_ident = local_ident,
        source: Expr = quote_str!(source).into(),
        // the builtin `require` is considered an unresolved identifier.
        // we have to match that, or it won't be recognized as
        // a proper `require()` call.
        require = quote_ident!(unresolved_ctxt, "require")
    )
}
