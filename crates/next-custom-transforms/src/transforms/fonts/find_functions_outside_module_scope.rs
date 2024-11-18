use swc_core::{
    common::errors::HANDLER,
    ecma::{
        ast::*,
        visit::{noop_visit_type, Visit},
    },
};
pub struct FindFunctionsOutsideModuleScope<'a> {
    pub state: &'a super::State,
}

impl Visit for FindFunctionsOutsideModuleScope<'_> {
    noop_visit_type!();

    fn visit_ident(&mut self, ident: &Ident) {
        if self.state.font_functions.contains_key(&ident.to_id())
            && !self
                .state
                .font_functions_in_allowed_scope
                .contains(&ident.span.lo)
        {
            HANDLER.with(|handler| {
                handler
                    .struct_span_err(
                        ident.span,
                        "Font loaders must be called and assigned to a const in the module scope",
                    )
                    .emit()
            });
        }
    }
}
