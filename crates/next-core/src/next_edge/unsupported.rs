use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    resolve::{
        options::{ImportMapResult, ImportMappingReplacement, ReplacedImportMapping},
        parse::Request,
        pattern::Pattern,
        ResolveResult,
    },
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::runtime_functions::TURBOPACK_EXPORT_NAMESPACE;
use turbopack_node::execution_context::ExecutionContext;

/// Intercepts requests for the given request to `unsupported` error messages
/// by returning a VirtualSource proxies to any import request to raise a
/// runtime error.
///
/// This can be used by import map alias, refer `next_import_map` for the setup.
#[turbo_tasks::value(shared)]
pub struct NextEdgeUnsupportedModuleReplacer {
    project_path: ResolvedVc<FileSystemPath>,
    execution_context: ResolvedVc<ExecutionContext>,
}

#[turbo_tasks::value_impl]
impl NextEdgeUnsupportedModuleReplacer {
    #[turbo_tasks::function]
    pub fn new(
        project_path: ResolvedVc<FileSystemPath>,
        execution_context: ResolvedVc<ExecutionContext>,
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
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Ignore.cell()
    }

    #[turbo_tasks::function]
    async fn result(
        &self,
        root_path: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        if let Request::Module { module, .. } = request {
            // packages/next/src/server/web/globals.ts augments global with
            // `__import_unsupported` and necessary functions.
            let code = formatdoc! {
              r#"
              {TURBOPACK_EXPORT_NAMESPACE}(__import_unsupported(`{module}`));
              "#
            };
            let content = AssetContent::file(File::from(code).into());
            let source = VirtualSource::new(root_path, content).to_resolved().await?;
            return Ok(ImportMapResult::Result(
                ResolveResult::source(ResolvedVc::upcast(source)).resolved_cell(),
            )
            .cell());
        };

        Ok(ImportMapResult::NoEntry.cell())
    }
}
