use swc_core::{
    common::{errors::HANDLER, pass::Optional},
    ecma::ast::{ModuleDecl, ModuleItem, Pass, Program},
};

pub fn disallow_re_export_all_in_page(is_page_file: bool) -> impl Pass {
    Optional::new(DisallowReExportAllInPage, is_page_file)
}

struct DisallowReExportAllInPage;

impl Pass for DisallowReExportAllInPage {
    fn process(&mut self, program: &mut Program) {
        let Program::Module(m) = program else {
            return;
        };

        for item in m.body.iter_mut() {
            let ModuleItem::ModuleDecl(ModuleDecl::ExportAll(e)) = item else {
                continue;
            };

            HANDLER.with(|handler| {
                handler
                    .struct_span_err(
                        e.span,
                        "Using `export * from '...'` in a page is disallowed. Please use `export { default } from '...'` instead.\nRead more: https://nextjs.org/docs/messages/export-all-in-page",
                    )
                    .emit()
            });
        }
    }
}
