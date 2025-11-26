use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    ident::AssetIdent,
    resolve::{
        ResolveResult,
        options::{ImportMapResult, ImportMappingReplacement, ReplacedImportMapping},
        parse::Request,
        pattern::Pattern,
    },
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::runtime_functions::TURBOPACK_EXPORT_NAMESPACE;

/// Intercepts requests for the given request to `unsupported` error messages
/// by returning a VirtualSource proxies to any import request to raise a
/// runtime error.
///
/// This can be used by import map alias, refer `next_import_map` for the setup.
#[turbo_tasks::value(shared)]
pub struct NextEdgeUnsupportedModuleReplacer {}

#[turbo_tasks::value_impl]
impl NextEdgeUnsupportedModuleReplacer {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        NextEdgeUnsupportedModuleReplacer {}.cell()
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
        lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        if let Request::Module { module, .. } = request {
            // Call out to separate `unsupported_module_source` to only have a single Source cell
            // for requests with different subpaths: `fs` and `fs/promises`.
            let source =
                unsupported_module_source(lookup_path.root().owned().await?, module.clone())
                    .to_resolved()
                    .await?;
            Ok(ImportMapResult::Result(ResolveResult::source(ResolvedVc::upcast(source))).cell())
        } else {
            Ok(ImportMapResult::NoEntry.cell())
        }
    }
}

#[turbo_tasks::function]
fn unsupported_module_source(root_path: FileSystemPath, module: Pattern) -> Vc<VirtualSource> {
    // packages/next/src/server/web/globals.ts augments global with
    // `__import_unsupported` and necessary functions.
    let code = formatdoc! {
        r#"
        {TURBOPACK_EXPORT_NAMESPACE}(__import_unsupported(`{module}`));
        "#,
        module = module.as_constant_string().map(ToString::to_string).unwrap_or_else(|| module.describe_as_string()),
    };
    let content = AssetContent::file(File::from(code).into());
    VirtualSource::new_with_ident(
        AssetIdent::from_path(root_path).with_modifier(
            format!("unsupported edge import {}", module.describe_as_string()).into(),
        ),
        content,
    )
}
