use indexmap::{indexset, IndexMap, IndexSet};
use lazy_static::lazy_static;
use swc_core::{
    atoms::Atom,
    common::{source_map::PURE_SP, util::take::Take, Mark, SyntaxContext},
    ecma::{
        ast::*,
        utils::{prepend_stmt, prepend_stmts, private_ident, quote_ident, quote_str, StmtLike},
        visit::{noop_visit_mut_type, visit_mut_pass, VisitMut, VisitMutWith},
    },
    quote,
};

pub fn track_dynamic_imports(unresolved_mark: Mark) -> impl VisitMut + Pass {
    visit_mut_pass(ImportReplacer::new(unresolved_mark))
}

struct ImportReplacer {
    unresolved_ctxt: SyntaxContext,
    track_dynamic_import_local_ident: Ident,
    track_async_function_local_ident: Ident,
    has_dynamic_import: bool,
    identifiers_to_instrument: IndexMap<Atom, Ident>,
}

impl ImportReplacer {
    pub fn new(unresolved_mark: Mark) -> Self {
        ImportReplacer {
            unresolved_ctxt: SyntaxContext::empty().apply_mark(unresolved_mark),
            track_dynamic_import_local_ident: private_ident!("$$trackDynamicImport__"),
            track_async_function_local_ident: private_ident!("$$trackAsyncFunction__"),
            has_dynamic_import: false,
            identifiers_to_instrument: IndexMap::new(),
        }
    }
}

lazy_static! {
    static ref GLOBALS_TO_INSTRUMENT: IndexSet<Atom> = indexset! {
        "__turbopack_load__".into(),
        "__webpack_load__".into(),
        "__webpack_require__".into(),
        "__turbopack_require__".into(),
    };
}

impl VisitMut for ImportReplacer {
    noop_visit_mut_type!();

    fn visit_mut_program(&mut self, program: &mut Program) {
        program.visit_mut_children_with(self);
        // if we wrapped a dynamic import while visiting the children, we need to import the wrapper

        // import()

        if self.has_dynamic_import {
            let import_args = MakeNamedImportArgs {
                original_ident: quote_ident!("trackDynamicImport").into(),
                local_ident: self.track_dynamic_import_local_ident.clone(),
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

        // bundler globals

        // `Script` needs `Vec<Stmt>`, but we need a shared type that works for both
        let mut new_module_items: Vec<ModuleItem> = vec![];

        if self.identifiers_to_instrument.len() > 0 {
            let import_args = MakeNamedImportArgs {
                original_ident: quote_ident!("trackAsyncFunction").into(),
                local_ident: self.track_async_function_local_ident.clone(),
                source: "private-next-rsc-track-dynamic-import",
                unresolved_ctxt: self.unresolved_ctxt,
            };
            new_module_items.push(match program {
                Program::Module(..) => make_named_import_esm(import_args),
                Program::Script(..) => make_named_import_cjs(import_args).into(),
            });
        }
        for (name, replacement_ident) in &self.identifiers_to_instrument {
            let name = name.as_str();
            let name_ident: Ident = quote_ident!(self.unresolved_ctxt, name).into();

            let replacement_expr = quote!(
                "$wrapper_fn($name_string, $original_ident)" as Expr,
                wrapper_fn = self.track_async_function_local_ident.clone(),
                name_string: Expr = quote_str!(name).into(),
                original_ident = name_ident.clone(),
            )
            .with_span(PURE_SP);

            // only define the replacement if the original is defined
            // to avoid breaking `if (typeof __turbopack_require__ !== undefined) { ... }` checks
            new_module_items.push(quote!(
                "if (typeof $original_ident === 'function') {\
                    var $replacement_ident = $replacement_expr;\
                }" as ModuleItem,
                original_ident = name_ident.clone(),
                replacement_ident = replacement_ident.clone(),
                replacement_expr: Expr = replacement_expr,
            ));
        }

        match program {
            Program::Module(module) => {
                prepend_stmts(&mut module.body, new_module_items.drain(..));
            }
            Program::Script(script) => {
                // a Script needs `Vec<Stmt>`, not `Vec<ModuleItem>`. We create the new items as
                // `ModuleItem`, but they're all convertible to a `Stmt`
                // (`import ... from ...` is only used in the `Module` case)
                let mut new_stmts = new_module_items
                    .into_iter()
                    .filter_map(|item| item.try_into_stmt().ok())
                    .collect::<Vec<_>>();
                prepend_stmts(&mut script.body, new_stmts.drain(..));
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
            let replacement_expr = quote!(
                "$wrapper_fn($expr)" as Expr,
                wrapper_fn = self.track_dynamic_import_local_ident.clone(),
                expr: Expr = expr.take()
            )
            .with_span(PURE_SP);
            *expr = replacement_expr
        }
    }

    fn visit_mut_ident(&mut self, ident: &mut Ident) {
        // find references to bundler globals like `__turbopack_load__`,
        // and replace them with an instrumented version
        // (we'll define the values for the new identifiers later, back up in `visit_mut_program`)
        //
        // "globals" like this use the unresolved syntax context
        // https://rustdoc.swc.rs/swc_core/ecma/transforms/base/fn.resolver.html#unresolved_mark
        // if it's not unresolved, then there's a local redefinition which we don't want to touch
        if ident.ctxt == self.unresolved_ctxt && GLOBALS_TO_INSTRUMENT.contains(&ident.sym) {
            let replacement_ident = self
                .identifiers_to_instrument
                .entry(ident.sym.clone())
                .or_insert_with(|| private_ident!(ident.sym.clone()));
            // source-map the replacement ident back to the original
            let replacement_ident = {
                let mut mapped = replacement_ident.clone();
                mapped.span = ident.span;
                mapped
            };
            *ident = replacement_ident;
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
        original_ident = original_ident.clone(),
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
