use std::{collections::BTreeMap, sync::LazyLock};

use anyhow::{Context, Result};
use either::Either;
use rustc_hash::FxHashMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::{FileSystem, FileSystemPath, to_sys_path};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{
        AliasPattern, ExternalTraced, ExternalType, ResolveAliasMap, SubpathValue,
        node::node_cjs_resolve_options,
        options::{ConditionValue, ImportMap, ImportMapping, ResolvedMap},
        parse::Request,
        pattern::Pattern,
        resolve,
    },
    source::Source,
};
use turbopack_node::execution_context::ExecutionContext;

use crate::{
    app_structure::CollectedRootParams,
    embed_js::{VIRTUAL_PACKAGE_NAME, next_js_fs},
    mode::NextMode,
    next_client::context::ClientContextType,
    next_config::{NextConfig, OptionFileSystemPath},
    next_edge::unsupported::NextEdgeUnsupportedModuleReplacer,
    next_font::google::{
        GOOGLE_FONTS_INTERNAL_PREFIX, NextFontGoogleCssModuleReplacer,
        NextFontGoogleFontFileReplacer, NextFontGoogleReplacer,
    },
    next_root_params::insert_next_root_params_mapping,
    next_server::context::ServerContextType,
    util::NextRuntime,
};

/// List of node.js internals that are not supported by edge runtime.
/// If these imports are used & user does not provide alias for the polyfill,
/// runtime error will be thrown.
/// This is not identical to the list of entire node.js internals, refer
/// https://vercel.com/docs/functions/runtimes/edge-runtime#compatible-node.js-modules
/// for the allowed imports.
static EDGE_UNSUPPORTED_NODE_INTERNALS: LazyLock<[RcStr; 44]> = LazyLock::new(|| {
    [
        rcstr!("child_process"),
        rcstr!("cluster"),
        rcstr!("console"),
        rcstr!("constants"),
        rcstr!("crypto"),
        rcstr!("dgram"),
        rcstr!("diagnostics_channel"),
        rcstr!("dns"),
        rcstr!("dns/promises"),
        rcstr!("domain"),
        rcstr!("fs"),
        rcstr!("fs/promises"),
        rcstr!("http"),
        rcstr!("http2"),
        rcstr!("https"),
        rcstr!("inspector"),
        rcstr!("module"),
        rcstr!("net"),
        rcstr!("os"),
        rcstr!("path"),
        rcstr!("path/posix"),
        rcstr!("path/win32"),
        rcstr!("perf_hooks"),
        rcstr!("process"),
        rcstr!("punycode"),
        rcstr!("querystring"),
        rcstr!("readline"),
        rcstr!("repl"),
        rcstr!("stream"),
        rcstr!("stream/promises"),
        rcstr!("stream/web"),
        rcstr!("string_decoder"),
        rcstr!("sys"),
        rcstr!("timers"),
        rcstr!("timers/promises"),
        rcstr!("tls"),
        rcstr!("trace_events"),
        rcstr!("tty"),
        rcstr!("v8"),
        rcstr!("vm"),
        rcstr!("wasi"),
        rcstr!("worker_threads"),
        rcstr!("zlib"),
        rcstr!("pnpapi"),
    ]
});

// Make sure to not add any external requests here.
/// Computes the Next-specific client import map.
#[turbo_tasks::function]
pub async fn get_next_client_import_map(
    project_path: FileSystemPath,
    ty: ClientContextType,
    next_config: Vc<NextConfig>,
    next_mode: Vc<NextMode>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    insert_next_shared_aliases(
        &mut import_map,
        project_path.clone(),
        execution_context,
        next_config,
        next_mode,
        false,
    )
    .await?;

    insert_optimized_module_aliases(&mut import_map, project_path.clone()).await?;

    insert_alias_option(
        &mut import_map,
        &project_path,
        next_config.resolve_alias_options(),
        ["browser"],
    )
    .await?;

    match &ty {
        ClientContextType::Pages { .. } => {}
        ClientContextType::App { app_dir } => {
            // Keep in sync with file:///./../../../packages/next/src/lib/needs-experimental-react.ts
            let react_flavor = if *next_config.enable_taint().await? {
                "-experimental"
            } else {
                ""
            };

            import_map.insert_exact_alias(
                rcstr!("react"),
                request_to_import_mapping(
                    app_dir.clone(),
                    format!("next/dist/compiled/react{react_flavor}").into(),
                ),
            );
            import_map.insert_wildcard_alias(
                rcstr!("react/"),
                request_to_import_mapping(
                    app_dir.clone(),
                    format!("next/dist/compiled/react{react_flavor}/*").into(),
                ),
            );
            import_map.insert_exact_alias(
                rcstr!("react-dom"),
                request_to_import_mapping(
                    app_dir.clone(),
                    format!("next/dist/compiled/react-dom{react_flavor}").into(),
                ),
            );
            import_map.insert_exact_alias(
                rcstr!("react-dom/static"),
                request_to_import_mapping(
                    app_dir.clone(),
                    rcstr!("next/dist/compiled/react-dom-experimental/static"),
                ),
            );
            import_map.insert_exact_alias(
                rcstr!("react-dom/static.edge"),
                request_to_import_mapping(
                    app_dir.clone(),
                    rcstr!("next/dist/compiled/react-dom-experimental/static.edge"),
                ),
            );
            import_map.insert_exact_alias(
                rcstr!("react-dom/static.browser"),
                request_to_import_mapping(
                    app_dir.clone(),
                    rcstr!("next/dist/compiled/react-dom-experimental/static.browser"),
                ),
            );
            let react_client_package = get_react_client_package(next_config).await?;
            import_map.insert_exact_alias(
                rcstr!("react-dom/client"),
                request_to_import_mapping(
                    app_dir.clone(),
                    format!("next/dist/compiled/react-dom{react_flavor}/{react_client_package}")
                        .into(),
                ),
            );
            import_map.insert_wildcard_alias(
                rcstr!("react-dom/"),
                request_to_import_mapping(
                    app_dir.clone(),
                    format!("next/dist/compiled/react-dom{react_flavor}/*").into(),
                ),
            );
            import_map.insert_wildcard_alias(
                rcstr!("react-server-dom-webpack/"),
                request_to_import_mapping(app_dir.clone(), rcstr!("react-server-dom-turbopack/*")),
            );
            import_map.insert_wildcard_alias(
                rcstr!("react-server-dom-turbopack/"),
                request_to_import_mapping(
                    app_dir.clone(),
                    format!("next/dist/compiled/react-server-dom-turbopack{react_flavor}/*").into(),
                ),
            );
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/head"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/client/components/noop-head"),
                ),
            );
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/dynamic"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/shared/lib/app-dynamic"),
                ),
            );
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/link"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/client/app-dir/link"),
                ),
            );
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/form"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/client/app-dir/form"),
                ),
            );
        }
        ClientContextType::Fallback => {}
        ClientContextType::Other => {}
    }

    // see https://github.com/vercel/next.js/blob/8013ef7372fc545d49dbd060461224ceb563b454/packages/next/src/build/webpack-config.ts#L1449-L1531
    insert_exact_alias_map(
        &mut import_map,
        project_path.clone(),
        fxindexmap! {
            rcstr!("server-only") => rcstr!("next/dist/compiled/server-only/index"),
            rcstr!("client-only") => rcstr!("next/dist/compiled/client-only/index"),
            rcstr!("next/dist/compiled/server-only") => rcstr!("next/dist/compiled/server-only/index"),
            rcstr!("next/dist/compiled/client-only") => rcstr!("next/dist/compiled/client-only/index"),
        },
    );
    insert_next_root_params_mapping(
        &mut import_map,
        next_config.enable_root_params(),
        Either::Right(ty.clone()),
        None,
    )
    .await?;

    match ty {
        ClientContextType::Pages { .. }
        | ClientContextType::App { .. }
        | ClientContextType::Fallback => {
            for (original, alias) in NEXT_ALIASES.iter() {
                import_map.insert_exact_alias(
                    format!("node:{original}"),
                    request_to_import_mapping(project_path.clone(), alias.clone()),
                );
            }
        }
        ClientContextType::Other => {}
    }

    insert_turbopack_dev_alias(&mut import_map).await?;
    insert_instrumentation_client_alias(&mut import_map, project_path).await?;

    Ok(import_map.cell())
}

/// Computes the Next-specific client fallback import map, which provides
/// polyfills to Node.js externals.
#[turbo_tasks::function]
pub async fn get_next_client_fallback_import_map(ty: ClientContextType) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    match ty {
        ClientContextType::Pages {
            pages_dir: context_dir,
        }
        | ClientContextType::App {
            app_dir: context_dir,
        } => {
            for (original, alias) in NEXT_ALIASES.iter() {
                import_map.insert_exact_alias(
                    original.clone(),
                    request_to_import_mapping(context_dir.clone(), alias.clone()),
                );
            }
        }
        ClientContextType::Fallback => {}
        ClientContextType::Other => {}
    }

    insert_turbopack_dev_alias(&mut import_map).await?;

    Ok(import_map.cell())
}

/// Computes the Next-specific server-side import map.
#[turbo_tasks::function]
pub async fn get_next_server_import_map(
    project_path: FileSystemPath,
    ty: ServerContextType,
    next_config: Vc<NextConfig>,
    next_mode: Vc<NextMode>,
    execution_context: Vc<ExecutionContext>,
    collected_root_params: Option<Vc<CollectedRootParams>>,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    insert_next_shared_aliases(
        &mut import_map,
        project_path.clone(),
        execution_context,
        next_config,
        next_mode,
        false,
    )
    .await?;

    insert_alias_option(
        &mut import_map,
        &project_path,
        next_config.resolve_alias_options(),
        [],
    )
    .await?;

    let external = ImportMapping::External(None, ExternalType::CommonJs, ExternalTraced::Traced)
        .resolved_cell();

    import_map.insert_exact_alias(rcstr!("next/dist/server/require-hook"), external);
    match ty {
        ServerContextType::Pages { .. } | ServerContextType::PagesApi { .. } => {
            import_map.insert_exact_alias(rcstr!("react"), external);
            import_map.insert_wildcard_alias(rcstr!("react/"), external);
            import_map.insert_exact_alias(rcstr!("react-dom"), external);
            import_map.insert_exact_alias(rcstr!("react-dom/client"), external);
            import_map.insert_wildcard_alias(rcstr!("react-dom/"), external);
            import_map.insert_exact_alias(rcstr!("styled-jsx"), external);
            import_map.insert_exact_alias(
                rcstr!("styled-jsx/style"),
                ImportMapping::External(
                    Some(rcstr!("styled-jsx/style.js")),
                    ExternalType::CommonJs,
                    ExternalTraced::Traced,
                )
                .resolved_cell(),
            );
            import_map.insert_wildcard_alias(rcstr!("styled-jsx/"), external);
            // TODO: we should not bundle next/dist/build/utils in the pages renderer at all
            import_map.insert_wildcard_alias(rcstr!("next/dist/build/utils"), external);
        }
        ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. } => {
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/head"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/client/components/noop-head"),
                ),
            );
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/dynamic"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/shared/lib/app-dynamic"),
                ),
            );
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/link"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/client/app-dir/link"),
                ),
            );
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/form"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/client/app-dir/form"),
                ),
            );
        }
        ServerContextType::Middleware { .. } | ServerContextType::Instrumentation { .. } => {}
    }

    insert_next_server_special_aliases(
        &mut import_map,
        project_path.clone(),
        ty,
        NextRuntime::NodeJs,
        next_config,
        collected_root_params,
    )
    .await?;

    Ok(import_map.cell())
}

/// Computes the Next-specific edge-side import map.
#[turbo_tasks::function]
pub async fn get_next_edge_import_map(
    project_path: FileSystemPath,
    ty: ServerContextType,
    next_config: Vc<NextConfig>,
    next_mode: Vc<NextMode>,
    execution_context: Vc<ExecutionContext>,
    collected_root_params: Option<Vc<CollectedRootParams>>,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    // https://github.com/vercel/next.js/blob/786ef25e529e1fb2dda398aebd02ccbc8d0fb673/packages/next/src/build/webpack-config.ts#L815-L861

    // Alias next/dist imports to next/dist/esm assets
    insert_wildcard_alias_map(
        &mut import_map,
        project_path.clone(),
        fxindexmap! {
            rcstr!("next/dist/build/") => rcstr!("next/dist/esm/build/*"),
            rcstr!("next/dist/client/") => rcstr!("next/dist/esm/client/*"),
            rcstr!("next/dist/shared/") => rcstr!("next/dist/esm/shared/*"),
            rcstr!("next/dist/pages/") => rcstr!("next/dist/esm/pages/*"),
            rcstr!("next/dist/lib/") => rcstr!("next/dist/esm/lib/*"),
            rcstr!("next/dist/server/") => rcstr!("next/dist/esm/server/*"),
            rcstr!("next/dist/api/") => rcstr!("next/dist/esm/api/*"),
        },
    );

    // Alias the usage of next public APIs
    insert_exact_alias_map(
        &mut import_map,
        project_path.clone(),
        fxindexmap! {
            rcstr!("next/app") => rcstr!("next/dist/api/app"),
            rcstr!("next/document") => rcstr!("next/dist/api/document"),
            rcstr!("next/dynamic") => rcstr!("next/dist/api/dynamic"),
            rcstr!("next/form") => rcstr!("next/dist/api/form"),
            rcstr!("next/head") => rcstr!("next/dist/api/head"),
            rcstr!("next/headers") => rcstr!("next/dist/api/headers"),
            rcstr!("next/image") => rcstr!("next/dist/api/image"),
            rcstr!("next/link") => rcstr!("next/dist/api/link"),
            rcstr!("next/navigation") => rcstr!("next/dist/api/navigation"),
            rcstr!("next/router") => rcstr!("next/dist/api/router"),
            rcstr!("next/script") => rcstr!("next/dist/api/script"),
            rcstr!("next/server") => rcstr!("next/dist/api/server"),
            rcstr!("next/og") => rcstr!("next/dist/api/og"),

            // Alias built-in @vercel/og to edge bundle for edge runtime
            rcstr!("next/dist/compiled/@vercel/og/index.node.js") => rcstr!("next/dist/compiled/@vercel/og/index.edge.js"),
        },
    );

    insert_next_shared_aliases(
        &mut import_map,
        project_path.clone(),
        execution_context,
        next_config,
        next_mode,
        true,
    )
    .await?;

    insert_optimized_module_aliases(&mut import_map, project_path.clone()).await?;

    insert_alias_option(
        &mut import_map,
        &project_path,
        next_config.resolve_alias_options(),
        [],
    )
    .await?;

    match &ty {
        ServerContextType::Pages { .. }
        | ServerContextType::PagesApi { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. } => {}
        ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. } => {
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/head"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/client/components/noop-head"),
                ),
            );
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/dynamic"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/shared/lib/app-dynamic"),
                ),
            );
            insert_exact_alias_or_js(
                &mut import_map,
                rcstr!("next/link"),
                request_to_import_mapping(
                    project_path.clone(),
                    rcstr!("next/dist/client/app-dir/link"),
                ),
            );
        }
    }

    insert_next_server_special_aliases(
        &mut import_map,
        project_path.clone(),
        ty.clone(),
        NextRuntime::Edge,
        next_config,
        collected_root_params,
    )
    .await?;

    // Look for where 'server/web/globals.ts` are imported to find out corresponding
    // context
    match ty {
        ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. }
        | ServerContextType::Pages { .. }
        | ServerContextType::PagesApi { .. } => {
            insert_unsupported_node_internal_aliases(&mut import_map).await?;
        }
    }

    Ok(import_map.cell())
}

/// Computes the Next-specific server-side and edge-side fallback import map.
#[turbo_tasks::function]
pub async fn get_next_edge_and_server_fallback_import_map(
    project_path: FileSystemPath,
    runtime: NextRuntime,
) -> Result<Vc<ImportMap>> {
    let mut fallback_import_map = ImportMap::empty();

    let external_cjs_if_node = move |context_dir: FileSystemPath, request: RcStr| match runtime {
        NextRuntime::Edge => request_to_import_mapping(context_dir, request),
        NextRuntime::NodeJs => external_request_to_cjs_import_mapping(context_dir, request),
    };

    fallback_import_map.insert_exact_alias(
        rcstr!("@opentelemetry/api"),
        // It needs to prefer the local version of @opentelemetry/api, so put this in the fallback
        // import map
        ImportMapping::Alternatives(vec![external_cjs_if_node(
            project_path,
            rcstr!("next/dist/compiled/@opentelemetry/api"),
        )])
        .resolved_cell(),
    );
    Ok(fallback_import_map.cell())
}

/// Insert default aliases for the node.js's internal to raise unsupported
/// runtime errors. User may provide polyfills for their own by setting user
/// config's alias.
async fn insert_unsupported_node_internal_aliases(import_map: &mut ImportMap) -> Result<()> {
    let unsupported_replacer = ImportMapping::Dynamic(ResolvedVc::upcast(
        NextEdgeUnsupportedModuleReplacer::new()
            .to_resolved()
            .await?,
    ))
    .resolved_cell();

    EDGE_UNSUPPORTED_NODE_INTERNALS.iter().for_each(|module| {
        import_map.insert_alias(AliasPattern::exact(module.clone()), unsupported_replacer);
    });
    Ok(())
}

pub fn get_next_client_resolved_map(
    _context: FileSystemPath,
    _root: FileSystemPath,
    _mode: NextMode,
) -> Vc<ResolvedMap> {
    let glob_mappings = vec![];
    ResolvedMap {
        by_glob: glob_mappings,
    }
    .cell()
}

static NEXT_ALIASES: LazyLock<[(RcStr, RcStr); 23]> = LazyLock::new(|| {
    [
        (rcstr!("assert"), rcstr!("next/dist/compiled/assert")),
        (rcstr!("buffer"), rcstr!("next/dist/compiled/buffer")),
        (
            rcstr!("constants"),
            rcstr!("next/dist/compiled/constants-browserify"),
        ),
        (
            rcstr!("crypto"),
            rcstr!("next/dist/compiled/crypto-browserify"),
        ),
        (
            rcstr!("domain"),
            rcstr!("next/dist/compiled/domain-browser"),
        ),
        (rcstr!("http"), rcstr!("next/dist/compiled/stream-http")),
        (
            rcstr!("https"),
            rcstr!("next/dist/compiled/https-browserify"),
        ),
        (rcstr!("os"), rcstr!("next/dist/compiled/os-browserify")),
        (rcstr!("path"), rcstr!("next/dist/compiled/path-browserify")),
        (rcstr!("punycode"), rcstr!("next/dist/compiled/punycode")),
        (
            rcstr!("process"),
            rcstr!("next/dist/build/polyfills/process"),
        ),
        (
            rcstr!("querystring"),
            rcstr!("next/dist/compiled/querystring-es3"),
        ),
        (
            rcstr!("stream"),
            rcstr!("next/dist/compiled/stream-browserify"),
        ),
        (
            rcstr!("string_decoder"),
            rcstr!("next/dist/compiled/string_decoder"),
        ),
        (rcstr!("sys"), rcstr!("next/dist/compiled/util")),
        (
            rcstr!("timers"),
            rcstr!("next/dist/compiled/timers-browserify"),
        ),
        (rcstr!("tty"), rcstr!("next/dist/compiled/tty-browserify")),
        (rcstr!("url"), rcstr!("next/dist/compiled/native-url")),
        (rcstr!("util"), rcstr!("next/dist/compiled/util")),
        (rcstr!("vm"), rcstr!("next/dist/compiled/vm-browserify")),
        (rcstr!("zlib"), rcstr!("next/dist/compiled/browserify-zlib")),
        (rcstr!("events"), rcstr!("next/dist/compiled/events")),
        (
            rcstr!("setImmediate"),
            rcstr!("next/dist/compiled/setimmediate"),
        ),
    ]
});

async fn insert_next_server_special_aliases(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    ty: ServerContextType,
    runtime: NextRuntime,
    next_config: Vc<NextConfig>,
    collected_root_params: Option<Vc<CollectedRootParams>>,
) -> Result<()> {
    let external_cjs_if_node = move |context_dir: FileSystemPath, request: RcStr| match runtime {
        NextRuntime::Edge => request_to_import_mapping(context_dir, request),
        NextRuntime::NodeJs => external_request_to_cjs_import_mapping(context_dir, request),
    };
    let external_esm_if_node = move |context_dir: FileSystemPath, request: RcStr| match runtime {
        NextRuntime::Edge => request_to_import_mapping(context_dir, request),
        NextRuntime::NodeJs => external_request_to_esm_import_mapping(context_dir, request),
    };

    import_map.insert_exact_alias(
        rcstr!("next/dist/compiled/@vercel/og/index.node.js"),
        external_esm_if_node(
            project_path.clone(),
            rcstr!("next/dist/compiled/@vercel/og/index.node.js"),
        ),
    );

    import_map.insert_exact_alias(
        rcstr!("next/dist/server/ReactDOMServerPages"),
        ImportMapping::Alternatives(vec![
            request_to_import_mapping(project_path.clone(), rcstr!("react-dom/server.edge")),
            request_to_import_mapping(project_path.clone(), rcstr!("react-dom/server.browser")),
        ])
        .resolved_cell(),
    );

    match &ty {
        ServerContextType::Pages { .. } | ServerContextType::PagesApi { .. } => {}
        // the logic closely follows the one in createRSCAliases in webpack-config.ts
        ServerContextType::AppSSR { app_dir }
        | ServerContextType::AppRSC { app_dir, .. }
        | ServerContextType::AppRoute { app_dir, .. } => {
            let next_package = get_next_package(app_dir.clone()).await?;
            import_map.insert_exact_alias(
                rcstr!("styled-jsx"),
                request_to_import_mapping(next_package.clone(), rcstr!("styled-jsx")),
            );
            import_map.insert_wildcard_alias(
                rcstr!("styled-jsx/"),
                request_to_import_mapping(next_package.clone(), rcstr!("styled-jsx/*")),
            );

            rsc_aliases(
                import_map,
                project_path.clone(),
                ty.clone(),
                runtime,
                next_config,
            )
            .await?;
        }
        ServerContextType::Middleware { .. } | ServerContextType::Instrumentation { .. } => {
            rsc_aliases(
                import_map,
                project_path.clone(),
                ty.clone(),
                runtime,
                next_config,
            )
            .await?;
        }
    }

    // see https://github.com/vercel/next.js/blob/8013ef7372fc545d49dbd060461224ceb563b454/packages/next/src/build/webpack-config.ts#L1449-L1531
    // Sets runtime aliases for the import to client|server-only. Depends on the
    // context, it'll resolve to the noop where it's allowed, or aliased into
    // the error which throws a runtime error. This works with in combination of
    // build-time error as well, refer https://github.com/vercel/next.js/blob/0060de1c4905593ea875fa7250d4b5d5ce10897d/packages/next-swc/crates/next-core/src/next_server/context.rs#L103
    match &ty {
        ServerContextType::Pages { .. } => {
            insert_exact_alias_map(
                import_map,
                project_path.clone(),
                fxindexmap! {
                    rcstr!("server-only") => rcstr!("next/dist/compiled/server-only/empty"),
                    rcstr!("client-only") => rcstr!("next/dist/compiled/client-only/index"),
                    rcstr!("next/dist/compiled/server-only") => rcstr!("next/dist/compiled/server-only/empty"),
                    rcstr!("next/dist/compiled/client-only") => rcstr!("next/dist/compiled/client-only/index"),
                },
            );
        }
        ServerContextType::PagesApi { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. } => {
            insert_exact_alias_map(
                import_map,
                project_path.clone(),
                fxindexmap! {
                    rcstr!("server-only") => rcstr!("next/dist/compiled/server-only/empty"),
                    rcstr!("client-only") => rcstr!("next/dist/compiled/client-only/error"),
                    rcstr!("next/dist/compiled/server-only") => rcstr!("next/dist/compiled/server-only/empty"),
                    rcstr!("next/dist/compiled/client-only") => rcstr!("next/dist/compiled/client-only/error"),
                },
            );
        }
        ServerContextType::AppSSR { .. } => {
            insert_exact_alias_map(
                import_map,
                project_path.clone(),
                fxindexmap! {
                    rcstr!("server-only") => rcstr!("next/dist/compiled/server-only/index"),
                    rcstr!("client-only") => rcstr!("next/dist/compiled/client-only/index"),
                    rcstr!("next/dist/compiled/server-only") => rcstr!("next/dist/compiled/server-only/index"),
                    rcstr!("next/dist/compiled/client-only") => rcstr!("next/dist/compiled/client-only/index"),
                },
            );
        }
    }

    insert_next_root_params_mapping(
        import_map,
        next_config.enable_root_params(),
        Either::Left(ty),
        collected_root_params,
    )
    .await?;

    import_map.insert_exact_alias(
        rcstr!("@vercel/og"),
        external_cjs_if_node(
            project_path.clone(),
            rcstr!("next/dist/server/og/image-response"),
        ),
    );

    import_map.insert_exact_alias(
        rcstr!("next/dist/compiled/next-devtools"),
        request_to_import_mapping(
            project_path.clone(),
            rcstr!("next/dist/next-devtools/dev-overlay.shim.js"),
        ),
    );

    Ok(())
}

async fn get_react_client_package(next_config: Vc<NextConfig>) -> Result<&'static str> {
    let react_production_profiling = *next_config.enable_react_production_profiling().await?;
    let react_client_package = if react_production_profiling {
        "profiling"
    } else {
        "client"
    };

    Ok(react_client_package)
}

// Use createVendoredReactAliases in file:///./../../../packages/next/src/build/create-compiler-aliases.ts
// as the source of truth.
async fn apply_vendored_react_aliases_server(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    ty: ServerContextType,
    runtime: NextRuntime,
    next_config: Vc<NextConfig>,
) -> Result<()> {
    let taint = *next_config.enable_taint().await?;
    let react_channel = if taint { "-experimental" } else { "" };
    let react_condition = if ty.should_use_react_server_condition() {
        "server"
    } else {
        "client"
    };

    // ✅ Correct alias
    // ❌ Incorrect alias i.e. importing this entrypoint should throw an error.
    // ❔ Alias that may produce correct code in certain conditions.Keep until react-markup is
    // available.

    let mut react_alias = FxIndexMap::default();
    if runtime == NextRuntime::NodeJs && react_condition == "client" {
        react_alias.extend(fxindexmap! {
            // file:///./../../../packages/next/src/compiled/react/package.json
            rcstr!("react") =>                                  /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/ssr/react"),
            rcstr!("react/compiler-runtime") =>                 /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/ssr/react-compiler-runtime"),
            rcstr!("react/jsx-dev-runtime") =>                  /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime"),
            rcstr!("react/jsx-runtime") =>                      /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime"),
            // file:///./../../../packages/next/src/compiled/react-dom/package.json
            rcstr!("react-dom") =>                              /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/ssr/react-dom"),
            rcstr!("react-dom/client") =>                       /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/client").into(),
            rcstr!("react-dom/server") =>                       /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/server.node").into(),
            rcstr!("react-dom/server.browser") =>               /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/server.browser").into(),
            // TODO: Use build without legacy APIs
            rcstr!("react-dom/server.edge") =>                  /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/server.edge").into(),
            rcstr!("react-dom/static") =>                       /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/static.node").into(),
            rcstr!("react-dom/static.browser") =>               /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/static.browser").into(),
            rcstr!("react-dom/static.edge") =>                  /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/static.edge").into(),
            // file:///./../../../packages/next/src/compiled/react-server-dom-webpack/package.json
            rcstr!("react-server-dom-webpack/client") =>        /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/ssr/react-server-dom-turbopack-client"),
            rcstr!("react-server-dom-webpack/server") =>        /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node").into(),
            rcstr!("react-server-dom-webpack/server.node") =>   /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node").into(),
            rcstr!("react-server-dom-webpack/static") =>        /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/static.node").into(),
            rcstr!("react-server-dom-turbopack/client") =>      /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/ssr/react-server-dom-turbopack-client"),
            rcstr!("react-server-dom-turbopack/server") =>      /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node").into(),
            rcstr!("react-server-dom-turbopack/server.node") => /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node").into(),
            rcstr!("react-server-dom-turbopack/static.edge") => /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/static.edge").into(),
        })
    } else if runtime == NextRuntime::NodeJs && react_condition == "server" {
        react_alias.extend(fxindexmap! {
            // file:///./../../../packages/next/src/compiled/react/package.json
            rcstr!("react") =>                                  /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react"),
            rcstr!("react/compiler-runtime") =>                 /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react-compiler-runtime"),
            rcstr!("react/jsx-dev-runtime") =>                  /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime"),
            rcstr!("react/jsx-runtime") =>                      /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-runtime"),
            // file:///./../../../packages/next/src/compiled/react-dom/package.json
            rcstr!("react-dom") =>                              /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react-dom"),
            rcstr!("react-dom/client") =>                       /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/client").into(),
            rcstr!("react-dom/server") =>                       /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/server.node").into(),
            rcstr!("react-dom/server.browser") =>               /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/server.browser").into(),
            // TODO: Use build without legacy APIs
            rcstr!("react-dom/server.edge") =>                  /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/server.edge").into(),
            rcstr!("react-dom/static") =>                       /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/static.node").into(),
            rcstr!("react-dom/static.browser") =>               /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/static.browser").into(),
            rcstr!("react-dom/static.edge") =>                  /* ❔ */ format!("next/dist/compiled/react-dom{react_channel}/static.edge").into(),
            // file:///./../../../packages/next/src/compiled/react-server-dom-webpack/package.json
            rcstr!("react-server-dom-webpack/client") =>        /* ❔ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client.node").into(),
            rcstr!("react-server-dom-webpack/server") =>        /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server"),
            rcstr!("react-server-dom-webpack/server.node") =>   /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server"),
            rcstr!("react-server-dom-webpack/static") =>        /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-static"),
            rcstr!("react-server-dom-turbopack/client") =>      /* ❔ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client.node").into(),
            rcstr!("react-server-dom-turbopack/server") =>      /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server"),
            rcstr!("react-server-dom-turbopack/server.node") => /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server"),
            rcstr!("react-server-dom-turbopack/static") =>      /* ✅ */ rcstr!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-static"),

            // Needed to make `react-dom/server` work.
            // TODO: really?
                rcstr!("next/dist/compiled/react") => rcstr!("next/dist/compiled/react/index.js"),
        })
    } else if runtime == NextRuntime::Edge && react_condition == "client" {
        react_alias.extend(fxindexmap! {
            // file:///./../../../packages/next/src/compiled/react/package.json
            rcstr!("react") =>                                  /* ✅ */ format!("next/dist/compiled/react{react_channel}").into(),
            rcstr!("react/compiler-runtime") =>                 /* ✅ */ format!("next/dist/compiled/react{react_channel}/compiler-runtime").into(),
            rcstr!("react/jsx-dev-runtime") =>                  /* ✅ */ format!("next/dist/compiled/react{react_channel}/jsx-dev-runtime").into(),
            rcstr!("react/jsx-runtime") =>                      /* ✅ */ format!("next/dist/compiled/react{react_channel}/jsx-runtime").into(),
            // file:///./../../../packages/next/src/compiled/react-dom/package.json
            rcstr!("react-dom") =>                              /* ✅ */ format!("next/dist/compiled/react-dom{react_channel}").into(),
            rcstr!("react-dom/client") =>                       /* ✅ */ format!("next/dist/compiled/react-dom{react_channel}/client").into(),
            rcstr!("react-dom/server") =>                       /* ✅ */ format!("next/dist/compiled/react-dom{react_channel}/server.edge").into(),
            rcstr!("react-dom/server.browser") =>               /* ✅ */ format!("next/dist/compiled/react-dom{react_channel}/server.browser").into(),
            // TODO: Use build without legacy APIs
            rcstr!("react-dom/server.edge") =>                  /* ✅ */ format!("next/dist/compiled/react-dom{react_channel}/server.edge").into(),
            rcstr!("react-dom/static") =>                       /* ✅ */ format!("next/dist/compiled/react-dom{react_channel}/static.edge").into(),
            rcstr!("react-dom/static.browser") =>               /* ✅ */ format!("next/dist/compiled/react-dom{react_channel}/static.browser").into(),
            rcstr!("react-dom/static.edge") =>                  /* ✅ */ format!("next/dist/compiled/react-dom{react_channel}/static.edge").into(),
            // file:///./../../../packages/next/src/compiled/react-server-dom-webpack/package.json
            rcstr!("react-server-dom-webpack/client") =>        /* ✅ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client.edge").into(),
            rcstr!("react-server-dom-webpack/server") =>        /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.edge").into(),
            rcstr!("react-server-dom-webpack/server.node") =>   /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node").into(),
            rcstr!("react-server-dom-webpack/static") =>        /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/static.edge").into(),
            rcstr!("react-server-dom-turbopack/client") =>      /* ✅ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client.edge").into(),
            rcstr!("react-server-dom-turbopack/server") =>      /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.edge").into(),
            rcstr!("react-server-dom-turbopack/server.node") => /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node").into(),
            rcstr!("react-server-dom-turbopack/static") =>      /* ❌ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/static.edge").into(),
        })
    } else if runtime == NextRuntime::Edge && react_condition == "server" {
        react_alias.extend(fxindexmap! {
            // file:///./../../../packages/next/src/compiled/react/package.json
            rcstr!("react") =>                                  /* ✅ */ format!("next/dist/compiled/react{react_channel}/react.react-server").into(),
            rcstr!("react/compiler-runtime") =>                 /* ❌ */ format!("next/dist/compiled/react{react_channel}/compiler-runtime").into(),
            rcstr!("react/jsx-dev-runtime") =>                  /* ✅ */ format!("next/dist/compiled/react{react_channel}/jsx-dev-runtime.react-server").into(),
            rcstr!("react/jsx-runtime") =>                      /* ✅ */ format!("next/dist/compiled/react{react_channel}/jsx-runtime.react-server").into(),
            // file:///./../../../packages/next/src/compiled/react-dom/package.json
            rcstr!("react-dom") =>                              /* ✅ */ format!("next/dist/compiled/react-dom{react_channel}/react-dom.react-server").into(),
            rcstr!("react-dom/client") =>                       /* ❌ */ format!("next/dist/compiled/react-dom{react_channel}/client").into(),
            rcstr!("react-dom/server") =>                       /* ❌ */ format!("next/dist/compiled/react-dom{react_channel}/server.edge").into(),
            rcstr!("react-dom/server.browser") =>               /* ❌ */ format!("next/dist/compiled/react-dom{react_channel}/server.browser").into(),
            // TODO: Use build without legacy APIs
            rcstr!("react-dom/server.edge") =>                  /* ❌ */ format!("next/dist/compiled/react-dom{react_channel}/server.edge").into(),
            rcstr!("react-dom/static") =>                       /* ❌ */ format!("next/dist/compiled/react-dom{react_channel}/static.edge").into(),
            rcstr!("react-dom/static.browser") =>               /* ❌ */ format!("next/dist/compiled/react-dom{react_channel}/static.browser").into(),
            rcstr!("react-dom/static.edge") =>                  /* ❌ */ format!("next/dist/compiled/react-dom{react_channel}/static.edge").into(),
            // file:///./../../../packages/next/src/compiled/react-server-dom-webpack/package.json
            rcstr!("react-server-dom-webpack/client") =>        /* ❔ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client.edge").into(),
            rcstr!("react-server-dom-webpack/server") =>        /* ✅ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.edge").into(),
            rcstr!("react-server-dom-webpack/server.node") =>   /* ✅ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node").into(),
            rcstr!("react-server-dom-webpack/static") =>        /* ✅ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/static.edge").into(),
            rcstr!("react-server-dom-turbopack/client") =>      /* ❔ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client.edge").into(),
            rcstr!("react-server-dom-turbopack/server") =>      /* ✅ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.edge").into(),
            rcstr!("react-server-dom-turbopack/server.node") => /* ✅ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node").into(),
            rcstr!("react-server-dom-turbopack/static") =>      /* ✅ */ format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/static.edge").into(),
        });

        react_alias.extend(fxindexmap! {
            // This should just be `next/dist/compiled/react${react_channel}` but how to Rust.
            rcstr!("next/dist/compiled/react")                               => react_alias["react"].clone(),
            rcstr!("next/dist/compiled/react-experimental")                  => react_alias["react"].clone(),
            rcstr!("next/dist/compiled/react/compiler-runtime")              => react_alias["react/compiler-runtime"].clone(),
            rcstr!("next/dist/compiled/react-experimental/compiler-runtime") => react_alias["react/compiler-runtime"].clone(),
            rcstr!("next/dist/compiled/react/jsx-dev-runtime")               => react_alias["react/jsx-dev-runtime"].clone(),
            rcstr!("next/dist/compiled/react-experimental/jsx-dev-runtime")  => react_alias["react/jsx-dev-runtime"].clone(),
            rcstr!("next/dist/compiled/react/jsx-runtime")                   => react_alias["react/jsx-runtime"].clone(),
            rcstr!("next/dist/compiled/react-experimental/jsx-runtime")      => react_alias["react/jsx-runtime"].clone(),
            rcstr!("next/dist/compiled/react-dom")                           => react_alias["react-dom"].clone(),
            rcstr!("next/dist/compiled/react-dom-experimental")              => react_alias["react-dom"].clone(),
        });
    }

    let react_client_package = get_react_client_package(next_config).await?;
    react_alias.extend(fxindexmap! {
        rcstr!("react-dom/client") => RcStr::from(format!("next/dist/compiled/react-dom{react_channel}/{react_client_package}")),
    });

    let mut alias = react_alias;
    if react_condition == "server" {
        // This is used in the server runtime to import React Server Components.
        alias.extend(fxindexmap! {
            rcstr!("next/navigation") => rcstr!("next/dist/api/navigation.react-server"),
            rcstr!("next/link") => rcstr!("next/dist/client/app-dir/link.react-server"),
        });
    }

    insert_exact_alias_map(import_map, project_path, alias);

    Ok(())
}

async fn rsc_aliases(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    ty: ServerContextType,
    runtime: NextRuntime,
    next_config: Vc<NextConfig>,
) -> Result<()> {
    apply_vendored_react_aliases_server(
        import_map,
        project_path.clone(),
        ty.clone(),
        runtime,
        next_config,
    )
    .await?;

    let mut alias = FxIndexMap::default();
    if ty.should_use_react_server_condition() {
        // This is used in the server runtime to import React Server Components.
        alias.extend(fxindexmap! {
            rcstr!("next/navigation") => rcstr!("next/dist/api/navigation.react-server"),
            rcstr!("next/link") => rcstr!("next/dist/client/app-dir/link.react-server"),
        });
    }

    insert_exact_alias_map(import_map, project_path.clone(), alias);

    Ok(())
}

pub fn mdx_import_source_file() -> RcStr {
    format!("{VIRTUAL_PACKAGE_NAME}/mdx-import-source").into()
}

// Insert aliases for Next.js stubs of fetch, object-assign, and url
// Keep in sync with getOptimizedModuleAliases in webpack-config.ts
async fn insert_optimized_module_aliases(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
) -> Result<()> {
    insert_exact_alias_map(
        import_map,
        project_path,
        fxindexmap! {
            rcstr!("unfetch") => rcstr!("next/dist/build/polyfills/fetch/index.js"),
            rcstr!("isomorphic-unfetch") => rcstr!("next/dist/build/polyfills/fetch/index.js"),
            rcstr!("whatwg-fetch") => rcstr!("next/dist/build/polyfills/fetch/whatwg-fetch.js"),
            rcstr!("object-assign") => rcstr!("next/dist/build/polyfills/object-assign.js"),
            rcstr!("object.assign/auto") => rcstr!("next/dist/build/polyfills/object.assign/auto.js"),
            rcstr!("object.assign/implementation") => rcstr!("next/dist/build/polyfills/object.assign/implementation.js"),
            rcstr!("object.assign/polyfill") => rcstr!("next/dist/build/polyfills/object.assign/polyfill.js"),
            rcstr!("object.assign/shim") => rcstr!("next/dist/build/polyfills/object.assign/shim.js"),
            rcstr!("url") => rcstr!("next/dist/compiled/native-url"),
            rcstr!("node:url") => rcstr!("next/dist/compiled/native-url"),
        },
    );
    Ok(())
}

// Make sure to not add any external requests here.
async fn insert_next_shared_aliases(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    execution_context: Vc<ExecutionContext>,
    next_config: Vc<NextConfig>,
    next_mode: Vc<NextMode>,
    is_runtime_edge: bool,
) -> Result<()> {
    let package_root = next_js_fs().root().owned().await?;

    insert_alias_to_alternatives(
        import_map,
        mdx_import_source_file(),
        vec![
            request_to_import_mapping(project_path.clone(), rcstr!("./mdx-components")),
            request_to_import_mapping(project_path.clone(), rcstr!("./src/mdx-components")),
            request_to_import_mapping(project_path.clone(), rcstr!("@mdx-js/react")),
            request_to_import_mapping(project_path.clone(), rcstr!("@next/mdx/mdx-components.js")),
        ],
    );

    insert_package_alias(
        import_map,
        &format!("{VIRTUAL_PACKAGE_NAME}/"),
        package_root,
    );

    // NOTE: `@next/font/local` has moved to a BeforeResolve Plugin, so it does not
    // have ImportMapping replacers here.
    //
    // TODO: Add BeforeResolve plugins for `@next/font/google`

    let next_font_google_replacer_mapping = ImportMapping::Dynamic(ResolvedVc::upcast(
        NextFontGoogleReplacer::new(project_path.clone())
            .to_resolved()
            .await?,
    ))
    .resolved_cell();

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact(rcstr!("next/font/google/target.css")),
        next_font_google_replacer_mapping,
    );

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact(rcstr!("@next/font/google/target.css")),
        next_font_google_replacer_mapping,
    );

    let fetch_client = next_config.fetch_client(execution_context.env());
    import_map.insert_alias(
        AliasPattern::exact(rcstr!(
            "@vercel/turbopack-next/internal/font/google/cssmodule.module.css"
        )),
        ImportMapping::Dynamic(ResolvedVc::upcast(
            NextFontGoogleCssModuleReplacer::new(
                project_path.clone(),
                execution_context,
                next_mode,
                fetch_client,
            )
            .to_resolved()
            .await?,
        ))
        .resolved_cell(),
    );

    import_map.insert_alias(
        AliasPattern::exact(rcstr!(GOOGLE_FONTS_INTERNAL_PREFIX)),
        ImportMapping::Dynamic(ResolvedVc::upcast(
            NextFontGoogleFontFileReplacer::new(project_path.clone(), fetch_client)
                .to_resolved()
                .await?,
        ))
        .resolved_cell(),
    );

    let next_package = get_next_package(project_path.clone()).await?;
    import_map.insert_singleton_alias(rcstr!("@swc/helpers"), next_package.clone());
    import_map.insert_singleton_alias(rcstr!("styled-jsx"), next_package.clone());
    import_map.insert_singleton_alias(rcstr!("next"), project_path.clone());
    import_map.insert_singleton_alias(rcstr!("react"), project_path.clone());
    import_map.insert_singleton_alias(rcstr!("react-dom"), project_path.clone());
    let react_client_package = get_react_client_package(next_config).await?;
    import_map.insert_exact_alias(
        rcstr!("react-dom/client"),
        request_to_import_mapping(
            project_path.clone(),
            format!("react-dom/{react_client_package}").into(),
        ),
    );

    import_map.insert_alias(
        // Make sure you can't import custom server as it'll cause all Next.js internals to be
        // bundled which doesn't work.
        AliasPattern::exact(rcstr!("next")),
        ImportMapping::Empty.resolved_cell(),
    );

    //https://github.com/vercel/next.js/blob/f94d4f93e4802f951063cfa3351dd5a2325724b3/packages/next/src/build/webpack-config.ts#L1196
    import_map.insert_exact_alias(
        rcstr!("setimmediate"),
        request_to_import_mapping(
            project_path.clone(),
            rcstr!("next/dist/compiled/setimmediate"),
        ),
    );

    import_map.insert_exact_alias(
        rcstr!("private-next-rsc-server-reference"),
        request_to_import_mapping(
            project_path.clone(),
            rcstr!("next/dist/build/webpack/loaders/next-flight-loader/server-reference"),
        ),
    );
    import_map.insert_exact_alias(
        rcstr!("private-next-rsc-action-client-wrapper"),
        request_to_import_mapping(
            project_path.clone(),
            rcstr!("next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper"),
        ),
    );
    import_map.insert_exact_alias(
        rcstr!("private-next-rsc-action-validate"),
        request_to_import_mapping(
            project_path.clone(),
            rcstr!("next/dist/build/webpack/loaders/next-flight-loader/action-validate"),
        ),
    );
    import_map.insert_exact_alias(
        rcstr!("private-next-rsc-action-encryption"),
        request_to_import_mapping(
            project_path.clone(),
            rcstr!("next/dist/server/app-render/encryption"),
        ),
    );
    import_map.insert_exact_alias(
        rcstr!("private-next-rsc-cache-wrapper"),
        request_to_import_mapping(
            project_path.clone(),
            rcstr!("next/dist/build/webpack/loaders/next-flight-loader/cache-wrapper"),
        ),
    );
    import_map.insert_exact_alias(
        rcstr!("private-next-rsc-track-dynamic-import"),
        request_to_import_mapping(
            project_path.clone(),
            rcstr!("next/dist/build/webpack/loaders/next-flight-loader/track-dynamic-import"),
        ),
    );

    insert_turbopack_dev_alias(import_map).await?;
    insert_package_alias(
        import_map,
        "@vercel/turbopack-node/",
        turbopack_node::embed_js::embed_fs().root().owned().await?,
    );

    let image_config = next_config.image_config().await?;
    if let Some(loader_file) = image_config.loader_file.as_deref().map(RcStr::from) {
        import_map.insert_exact_alias(
            rcstr!("next/dist/shared/lib/image-loader"),
            request_to_import_mapping(project_path.clone(), loader_file.clone()),
        );

        if is_runtime_edge {
            import_map.insert_exact_alias(
                rcstr!("next/dist/esm/shared/lib/image-loader"),
                request_to_import_mapping(project_path.clone(), loader_file),
            );
        }
    }

    Ok(())
}

pub async fn get_next_package(context_directory: FileSystemPath) -> Result<FileSystemPath> {
    try_get_next_package(context_directory)
        .owned()
        .await?
        .context("Next.js package not found")
}

#[turbo_tasks::value(shared)]
struct MissingNextFolderIssue {
    path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for MissingNextFolderIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Fatal
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Resolve.into()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        let system_path = match to_sys_path(self.path.clone()).await? {
            Some(path) => path.to_str().unwrap_or("{unknown}").to_string(),
            _ => "{unknown}".to_string(),
        };

        Ok(StyledString::Stack(vec![
            StyledString::Line(vec![
                StyledString::Text(
                    "Error: Next.js inferred your workspace root, but it may not be correct.".into(),
                ),
            ]),
            StyledString::Line(vec![
                StyledString::Text("We couldn't find the Next.js package (".into()),
                StyledString::Strong("next/package.json".into()),
                StyledString::Text(") from the project directory: ".into()),
                StyledString::Strong(system_path.into()),
            ]),
            StyledString::Line(vec![
                StyledString::Text(" To fix this, set ".into()),
                StyledString::Code("turbopack.root".into()),
                StyledString::Text(
                    " in your Next.js config, or ensure the Next.js package is resolvable from this directory.".into(),
                ),
            ]),
            StyledString::Line(vec![
                StyledString::Text("Note: For security and performance reasons, files outside of the project directory will not be compiled.".into()),
            ]),
            StyledString::Line(vec![
                StyledString::Text("See ".into()),
                StyledString::Strong("https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory".into()),
                StyledString::Text(" for more information.".into())
            ]),
        ])
            .cell())
    }
}

#[turbo_tasks::function]
pub async fn try_get_next_package(
    context_directory: FileSystemPath,
) -> Result<Vc<OptionFileSystemPath>> {
    let root = context_directory.root().owned().await?;
    let result = resolve(
        context_directory.clone(),
        ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
        Request::parse(Pattern::Constant(rcstr!("next/package.json"))),
        node_cjs_resolve_options(root),
    );
    if let Some(source) = &*result.first_source().await? {
        Ok(Vc::cell(Some(source.ident().path().await?.parent())))
    } else {
        MissingNextFolderIssue {
            path: context_directory,
        }
        .resolved_cell()
        .emit();
        Ok(Vc::cell(None))
    }
}

pub async fn insert_alias_option<const N: usize>(
    import_map: &mut ImportMap,
    project_path: &FileSystemPath,
    alias_options: Vc<ResolveAliasMap>,
    conditions: [&'static str; N],
) -> Result<()> {
    let conditions = BTreeMap::from(conditions.map(|c| (c.into(), ConditionValue::Set)));
    for (alias, value) in &alias_options.await? {
        if let Some(mapping) = export_value_to_import_mapping(value, &conditions, project_path) {
            import_map.insert_alias(alias, mapping);
        }
    }
    Ok(())
}

fn export_value_to_import_mapping(
    value: &SubpathValue,
    conditions: &BTreeMap<RcStr, ConditionValue>,
    project_path: &FileSystemPath,
) -> Option<ResolvedVc<ImportMapping>> {
    let mut result = Vec::new();
    value.add_results(
        conditions,
        &ConditionValue::Unset,
        &mut FxHashMap::default(),
        &mut result,
    );
    if result.is_empty() {
        None
    } else {
        Some(if result.len() == 1 {
            ImportMapping::PrimaryAlternative(result[0].0.into(), Some(project_path.clone()))
                .resolved_cell()
        } else {
            ImportMapping::Alternatives(
                result
                    .iter()
                    .map(|(m, _)| {
                        ImportMapping::PrimaryAlternative((*m).into(), Some(project_path.clone()))
                            .resolved_cell()
                    })
                    .collect(),
            )
            .resolved_cell()
        })
    }
}

fn insert_exact_alias_map(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    map: FxIndexMap<RcStr, RcStr>,
) {
    for (pattern, request) in map {
        import_map.insert_exact_alias(
            pattern,
            request_to_import_mapping(project_path.clone(), request),
        );
    }
}

fn insert_wildcard_alias_map(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    map: FxIndexMap<RcStr, RcStr>,
) {
    for (pattern, request) in map {
        import_map.insert_wildcard_alias(
            pattern,
            request_to_import_mapping(project_path.clone(), request),
        );
    }
}

/// Inserts an alias to an alternative of import mappings into an import map.
fn insert_alias_to_alternatives<'a>(
    import_map: &mut ImportMap,
    alias: impl Into<RcStr> + 'a,
    alternatives: Vec<ResolvedVc<ImportMapping>>,
) {
    import_map.insert_exact_alias(
        alias.into(),
        ImportMapping::Alternatives(alternatives).resolved_cell(),
    );
}

/// Inserts an alias to an import mapping into an import map.
fn insert_package_alias(import_map: &mut ImportMap, prefix: &str, package_root: FileSystemPath) {
    import_map.insert_wildcard_alias(
        prefix,
        ImportMapping::PrimaryAlternative(rcstr!("./*"), Some(package_root)).resolved_cell(),
    );
}

/// Inserts an alias to @vercel/turbopack-dev into an import map.
async fn insert_turbopack_dev_alias(import_map: &mut ImportMap) -> Result<()> {
    insert_package_alias(
        import_map,
        "@vercel/turbopack-ecmascript-runtime/",
        turbopack_ecmascript_runtime::embed_fs()
            .root()
            .owned()
            .await?,
    );
    Ok(())
}

/// Handles instrumentation-client.ts bundling logic
async fn insert_instrumentation_client_alias(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
) -> Result<()> {
    insert_alias_to_alternatives(
        import_map,
        rcstr!("private-next-instrumentation-client"),
        vec![
            request_to_import_mapping(project_path.clone(), rcstr!("./src/instrumentation-client")),
            request_to_import_mapping(
                project_path.clone(),
                rcstr!("./src/instrumentation-client.ts"),
            ),
            request_to_import_mapping(project_path.clone(), rcstr!("./instrumentation-client")),
            request_to_import_mapping(project_path.clone(), rcstr!("./instrumentation-client.ts")),
            ImportMapping::Ignore.resolved_cell(),
        ],
    );

    Ok(())
}

// To alias e.g. both `import "next/link"` and `import "next/link.js"`
fn insert_exact_alias_or_js(
    import_map: &mut ImportMap,
    pattern: RcStr,
    mapping: ResolvedVc<ImportMapping>,
) {
    import_map.insert_exact_alias(format!("{pattern}.js"), mapping);
    import_map.insert_exact_alias(pattern, mapping);
}

/// Creates a direct import mapping to the result of resolving a request
/// in a context.
fn request_to_import_mapping(
    context_path: FileSystemPath,
    request: RcStr,
) -> ResolvedVc<ImportMapping> {
    ImportMapping::PrimaryAlternative(request, Some(context_path)).resolved_cell()
}

/// Creates a direct import mapping to the result of resolving an external
/// request.
fn external_request_to_cjs_import_mapping(
    context_dir: FileSystemPath,
    request: RcStr,
) -> ResolvedVc<ImportMapping> {
    ImportMapping::PrimaryAlternativeExternal {
        name: Some(request),
        ty: ExternalType::CommonJs,
        traced: ExternalTraced::Traced,
        lookup_dir: context_dir,
    }
    .resolved_cell()
}

/// Creates a direct import mapping to the result of resolving an external
/// request.
fn external_request_to_esm_import_mapping(
    context_dir: FileSystemPath,
    request: RcStr,
) -> ResolvedVc<ImportMapping> {
    ImportMapping::PrimaryAlternativeExternal {
        name: Some(request),
        ty: ExternalType::EcmaScriptModule,
        traced: ExternalTraced::Traced,
        lookup_dir: context_dir,
    }
    .resolved_cell()
}
