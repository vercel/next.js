use turbopack_binding::swc::core::{
    common::errors::HANDLER,
    ecma::{
        ast::*,
        visit::{noop_visit_type, Visit},
    },
};
pub struct FindFunctionsOutsideModuleScope<'a> {
    pub state: &'a super::State,
}

impl<'a> Visit for FindFunctionsOutsideModuleScope<'a> {
    noop_visit_type!();

    fn visit_ident(&mut self, ident: &Ident) {
        if self.state.font_functions.get(&ident.to_id()).is_some()
            && self
                .state
                .font_functions_in_allowed_scope
                .get(&ident.span.lo)
                .is_none()
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
