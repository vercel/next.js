use std::iter;

use anyhow::{Result, anyhow, ensure};
use either::Either;
use indoc::formatdoc;
use itertools::Itertools;
use turbo_rcstr::RcStr;
use turbo_tasks::{EitherTaskInput, ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    issue::IssueExt,
    resolve::{
        ResolveResult,
        options::{
            ImportMap, ImportMapResult, ImportMapping, ImportMappingReplacement,
            ReplacedImportMapping,
        },
        parse::Request,
        pattern::Pattern,
    },
    virtual_source::VirtualSource,
};

use crate::{
    app_structure::CollectedRootParams, embed_js::next_js_file_path,
    next_client::ClientContextType, next_server::ServerContextType,
    next_shared::resolve::InvalidImportModuleIssue,
};

// The resolver extracts queries from module subpaths.
const ROOT_PARAM_GETTER_MODULE: &str = "private-next-root-params/getter";

pub async fn insert_next_root_params_mapping(
    import_map: &mut ImportMap,
    ty: Either<ServerContextType, ClientContextType>,
    collected_root_params: Option<Vc<CollectedRootParams>>,
) -> Result<()> {
    let mapping = get_next_root_params_mapping(EitherTaskInput(ty), collected_root_params)
        .to_resolved()
        .await?;
    import_map.insert_exact_alias("next/root-params", mapping);
    import_map.insert_exact_alias(ROOT_PARAM_GETTER_MODULE, mapping);
    Ok(())
}

#[turbo_tasks::function]
async fn get_next_root_params_mapping(
    ty: EitherTaskInput<ServerContextType, ClientContextType>,
    collected_root_params: Option<Vc<CollectedRootParams>>,
) -> Result<Vc<ImportMapping>> {
    // This mapping goes into the global resolve options, so we want to avoid invalidating it if
    // value of `collected_root_params` changes (which would invalidate everything else compiled
    // using those resolve options!).
    // We can achieve this by using a dynamic import mapping
    // which only reads `collected_root_params` when producing a mapping result. That way, if
    // `collected_root_params` changes, the resolve options will remain the same, and
    // only the mapping result will be invalidated.
    let mapping = ImportMapping::Dynamic(ResolvedVc::upcast(
        NextRootParamsMapper::new(ty, collected_root_params)
            .to_resolved()
            .await?,
    ));
    Ok(mapping.cell())
}

#[turbo_tasks::value]
struct NextRootParamsMapper {
    #[bincode(with = "turbo_bincode::either")]
    context_type: Either<ServerContextType, ClientContextType>,
    collected_root_params: Option<ResolvedVc<CollectedRootParams>>,
}

#[turbo_tasks::value_impl]
impl NextRootParamsMapper {
    #[turbo_tasks::function]
    pub fn new(
        context_type: EitherTaskInput<ServerContextType, ClientContextType>,
        collected_root_params: Option<ResolvedVc<CollectedRootParams>>,
    ) -> Vc<Self> {
        NextRootParamsMapper {
            context_type: context_type.0,
            collected_root_params,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn import_map_result(
        self: Vc<Self>,
        param_name: Option<RcStr>,
    ) -> Result<Vc<ImportMapResult>> {
        let this = self.await?;
        Ok(match &this.context_type {
            Either::Left(server_ty) => match &server_ty {
                ServerContextType::AppRSC { .. } | ServerContextType::AppRoute { .. } => {
                    let collected_root_params = *this.collected_root_params.ok_or_else(|| {
                        anyhow!(
                            "Invariant: Root params should have been collected for context {:?}. \
                             This is a bug in Next.js.",
                            server_ty.clone()
                        )
                    })?;
                    Self::valid_import_map_result(collected_root_params, param_name)
                }
                ServerContextType::PagesApi { .. }
                | ServerContextType::Instrumentation { .. }
                | ServerContextType::Middleware { .. } => {
                    // There's no sensible way to use root params outside of the app
                    // directory. TODO: make sure this error is consistent with webpack
                    Self::invalid_import_map_result(
                        "'next/root-params' can only be used inside the App Directory.".into(),
                    )
                }
                _ => {
                    // In general, the compiler should prevent importing 'next/root-params'
                    // from client modules, but it doesn't catch everything. If an import
                    // slips through our validation, make it error.
                    Self::invalid_import_map_result(
                        "'next/root-params' cannot be imported from a Client Component module. It \
                         should only be used from a Server Component."
                            .into(),
                    )
                }
            },
            Either::Right(_) => {
                // In general, the compiler should prevent importing 'next/root-params' from
                // client modules, but it doesn't catch everything. If an import slips
                // through our validation, make it error.
                Self::invalid_import_map_result(
                    "'next/root-params' cannot be imported from a Client Component module. It \
                     should only be used from a Server Component."
                        .into(),
                )
            }
        })
    }

    #[turbo_tasks::function]
    async fn valid_import_map_result(
        collected_root_params: ResolvedVc<CollectedRootParams>,
        param_name: Option<RcStr>,
    ) -> Result<Vc<ImportMapResult>> {
        let collected_root_params = collected_root_params.await?;

        let (filename, module_content) = if let Some(param_name) = param_name {
            ensure!(
                collected_root_params.contains(&param_name),
                "Unknown root parameter in generated getter request: {param_name}"
            );
            (
                format!("root-params/{param_name}.js").into(),
                formatdoc!(
                    r#"
                        import {{ getRootParam }} from 'next/dist/server/request/root-params';
                        export function {param_name}() {{
                            return getRootParam('{param_name}');
                        }}
                    "#,
                ),
            )
        } else {
            // The generated `next/root-params` module only re-exports getters.
            // The side-effect-free directive lets Turbopack resolve named
            // imports without including unrelated getter modules.
            let module_content =
                iter::once("'use turbopack: no side effects';\nexport {};".to_string())
                    .chain(collected_root_params.iter().map(|param_name| {
                        format!(
                            "export {{ {param_name} }} from \
                             '{ROOT_PARAM_GETTER_MODULE}?{param_name}';"
                        )
                    }))
                    .join("\n");
            ("root-params.js".into(), module_content)
        };

        let virtual_source = VirtualSource::new(
            next_js_file_path(filename).owned().await?,
            AssetContent::file(FileContent::Content(module_content.into()).cell()),
        )
        .to_resolved()
        .await?;

        let import_map_result = ImportMapResult::Result(
            ResolveResult::source(ResolvedVc::upcast(virtual_source)).resolved_cell(),
        );
        Ok(import_map_result.cell())
    }

    #[turbo_tasks::function]
    async fn invalid_import_map_result(message: RcStr) -> Result<Vc<ImportMapResult>> {
        let path: FileSystemPath = next_js_file_path("root-params.js".into()).owned().await?;

        // error the compilation.
        InvalidImportModuleIssue {
            file_path: path.clone(),
            messages: vec![message.clone()],
            skip_context_message: false,
        }
        .resolved_cell()
        .emit();

        // map to a dummy module that rethrows the error at runtime.
        let virtual_source = VirtualSource::new(
            path.clone(),
            AssetContent::file(
                FileContent::Content(
                    format!("throw new Error({})", serde_json::to_string(&message)?).into(),
                )
                .cell(),
            ),
        )
        .to_resolved()
        .await?;

        let import_map_result = ImportMapResult::Result(
            ResolveResult::source(ResolvedVc::upcast(virtual_source)).resolved_cell(),
        );
        Ok(import_map_result.cell())
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextRootParamsMapper {
    #[turbo_tasks::function]
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Ignore.cell()
    }

    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        _lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = request.await?;
        let param_name = match &*request {
            Request::Module { query, .. }
                if request.request().as_deref() == Some(ROOT_PARAM_GETTER_MODULE) =>
            {
                Some(
                    query
                        .strip_prefix('?')
                        .ok_or_else(|| {
                            anyhow!("Missing root parameter in generated getter request")
                        })?
                        .into(),
                )
            }
            _ => None,
        };
        // Share generated sources across importers with the same root name.
        Ok(self.import_map_result(param_name))
    }
}
