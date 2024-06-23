use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::{RcStr, Vc};
use turbo_tasks_fs::File;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::{
        core::{
            asset::AssetContent,
            resolve::{
                options::{ImportMapResult, ImportMapping, ImportMappingReplacement},
                parse::Request,
                ResolveResult,
            },
            virtual_source::VirtualSource,
        },
        node::execution_context::ExecutionContext,
    },
};

/// Intercepts requests for the given request to `unsupported` error messages
/// by returning a VirtualSource proxies to any import request to raise a
/// runtime error.
///
/// This can be used by import map alias, refer `next_import_map` for the setup.
#[turbo_tasks::value(shared)]
pub struct NextEdgeUnsupportedModuleReplacer {
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
}

#[turbo_tasks::value_impl]
impl NextEdgeUnsupportedModuleReplacer {
    #[turbo_tasks::function]
    pub fn new(
        project_path: Vc<FileSystemPath>,
        execution_context: Vc<ExecutionContext>,
    ) -> Vc<Self> {
        Self::cell(NextEdgeUnsupportedModuleReplacer {
            project_path,
            execution_context,
        })
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextEdgeUnsupportedModuleReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: RcStr) -> Vc<ImportMapping> {
        ImportMapping::Ignore.into()
    }

    #[turbo_tasks::function]
    async fn result(
        &self,
        context: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        if let Request::Module { module, .. } = request {
            // packages/next/src/server/web/globals.ts augments global with
            // `__import_unsupported` and necessary functions.
            let code = formatdoc! {
              r#"
              __turbopack_export_namespace__(__import_unsupported(`{module}`));
              "#
            };
            let content = AssetContent::file(File::from(code).into());
            let source = VirtualSource::new(context, content);
            return Ok(
                ImportMapResult::Result(ResolveResult::source(Vc::upcast(source)).into()).into(),
            );
        };

        Ok(ImportMapResult::NoEntry.into())
    }
}
