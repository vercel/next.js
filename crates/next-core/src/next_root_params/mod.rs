use std::iter;

use anyhow::Result;
use either::Either;
use indoc::formatdoc;
use itertools::Itertools;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
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
    app_structure::CollectedRootParams,
    embed_js::next_js_file_path,
    next_client::ClientContextType,
    next_server::ServerContextType,
    next_shared::resolve::{InvalidImportPattern, InvalidImportResolvePlugin},
};

pub fn get_invalid_next_root_params_resolve_plugin(
    is_root_params_enabled: bool,
    ty: Either<ServerContextType, ClientContextType>,
    root: ResolvedVc<FileSystemPath>,
) -> Option<Vc<InvalidImportResolvePlugin>> {
    // Hard-error if the flag is not enabled, regardless of if we're on the server or on the client.
    if !is_root_params_enabled {
        return Some(InvalidImportResolvePlugin::new(
            *root,
            InvalidImportPattern::Glob("next/root-params".into()),
            vec![
                "'next/root-params' can only be imported when `experimental.rootParams` is \
                 enabled."
                    .into(),
            ],
        ));
    }
    match ty {
        Either::Left(server_ty) => match server_ty {
            ServerContextType::AppRSC { .. } | ServerContextType::AppRoute { .. } => {
                // Valid usage. We'll map this request to generated code in
                // `insert_next_root_params_mapping`.
                None
            }
            ServerContextType::PagesData { .. }
            | ServerContextType::PagesApi { .. }
            | ServerContextType::Instrumentation { .. }
            | ServerContextType::Middleware { .. } => {
                // There's no sensible way to use root params outside of the app directory.
                // TODO: make sure this error is consistent with webpack
                Some(InvalidImportResolvePlugin::new(
                    *root,
                    InvalidImportPattern::Glob("next/root-params".into()),
                    vec!["'next/root-params' can only be used inside the App Directory.".into()],
                ))
            }
            _ => {
                // In general, the compiler should prevent importing 'next/root-params' from client
                // modules, but it doesn't catch everything. If an import slips
                // through our validation, make it error.
                Some(InvalidImportResolvePlugin::new(
                    *root,
                    InvalidImportPattern::Glob("next/root-params".into()),
                    vec![
                        "'next/root-params' cannot be imported from a Client Component module. It \
                         should only be used from a Server Component."
                            .into(),
                    ],
                ))
            }
        },
        Either::Right(_) => {
            // In general, the compiler should prevent importing 'next/root-params' from client
            // modules, but it doesn't catch everything. If an import slips
            // through our validation, make it error.
            Some(InvalidImportResolvePlugin::new(
                *root,
                InvalidImportPattern::Glob("next/root-params".into()),
                vec![
                    "'next/root-params' cannot be imported from a Client Component module. It \
                     should only be used from a Server Component."
                        .into(),
                ],
            ))
        }
    }
}

pub async fn insert_next_root_params_mapping(
    import_map: &mut ImportMap,
    ty: ServerContextType,
    collected_root_params: Option<Vc<CollectedRootParams>>,
) -> Result<()> {
    match ty {
        ServerContextType::AppRSC { .. } | ServerContextType::AppRoute { .. } => {
            import_map.insert_exact_alias(
                "next/root-params",
                get_next_root_params_mapping(collected_root_params)
                    .to_resolved()
                    .await?,
            );
        }
        _ => {
            // `get_invalid_next_root_params_resolve_plugin` already triggered an error for other
            // contexts, so we can ignore them here.
            // (and if we missed something there, it'll resolve to the stub `next/root-params.js`
            // file which throws a runtime error when imported)
        }
    };
    Ok(())
}

#[turbo_tasks::function]
async fn get_next_root_params_mapping(
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
        NextRootParamsMapper::new(collected_root_params)
            .to_resolved()
            .await?,
    ));
    Ok(mapping.cell())
}

#[turbo_tasks::value]
struct NextRootParamsMapper {
    collected_root_params: Option<ResolvedVc<CollectedRootParams>>,
}

#[turbo_tasks::value_impl]
impl NextRootParamsMapper {
    #[turbo_tasks::function]
    pub fn new(collected_root_params: Option<ResolvedVc<CollectedRootParams>>) -> Vc<Self> {
        NextRootParamsMapper {
            collected_root_params,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn import_map_result(&self) -> Result<Vc<ImportMapResult>> {
        // Generate a virtual 'next/root-params' module based on the root params we collected.
        let module_content = match self.collected_root_params {
            // If there's no root params, export nothing.
            None => "export {}".to_string(),
            Some(collected_root_params_vc) => {
                let collected_root_params = collected_root_params_vc.await?;
                if collected_root_params.is_empty() {
                    "export {}".to_string()
                } else {
                    iter::once(formatdoc!(
                        r#"
                        import {{ getRootParam }} from 'next/dist/server/request/root-params';
                    "#,
                    ))
                    .chain(collected_root_params.iter().map(|param_name| {
                        formatdoc!(
                            r#"
                            export function {PARAM_NAME}() {{
                                return getRootParam('{PARAM_NAME}');
                            }}
                        "#,
                            PARAM_NAME = param_name,
                        )
                    }))
                    .join("\n")
                }
            }
        };

        let virtual_source = VirtualSource::new(
            next_js_file_path("root-params.js".into()),
            AssetContent::file(FileContent::Content(module_content.into()).cell()),
        )
        .to_resolved()
        .await?;

        let import_map_result =
            ImportMapResult::Result(ResolveResult::source(ResolvedVc::upcast(virtual_source)));
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
        _lookup_path: Vc<FileSystemPath>,
        _request: Vc<Request>,
    ) -> Vc<ImportMapResult> {
        // Delegate to an inner function that only depends on `collected_root_params` --
        // we want to return the same cell regardless of the arguments we received here.
        self.import_map_result()
    }
}
