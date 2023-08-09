use turbopack_binding::swc::core::{
    common::errors::HANDLER,
    ecma::{
        ast::ExportAll,
        transforms::base::pass::Optional,
        visit::{noop_fold_type, Fold},
    },
};

pub fn disallow_re_export_all_in_page(is_page_file: bool) -> impl Fold {
    Optional::new(DisallowReExportAllInPage, is_page_file)
}

struct DisallowReExportAllInPage;

impl Fold for DisallowReExportAllInPage {
    noop_fold_type!();

    fn fold_export_all(&mut self, e: ExportAll) -> ExportAll {
        HANDLER.with(|handler| {
          handler
            .struct_span_err(
              e.span,
              "Using `export * from '...'` in a page is disallowed. Please use `export { default } from '...'` instead.\nRead more: https://nextjs.org/docs/messages/export-all-in-page",
            )
            .emit()
        });
        e
    }
}
