use std::collections::BTreeMap;

use anyhow::{Context, Result};
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{fxindexmap, FxIndexMap, ResolvedVc, Value, Vc};
use turbo_tasks_fs::{FileSystem, FileSystemPath};
use turbopack_core::{
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{
        node::node_cjs_resolve_options,
        options::{ConditionValue, ImportMap, ImportMapping, ResolvedMap},
        parse::Request,
        pattern::Pattern,
        resolve, AliasPattern, ExternalTraced, ExternalType, ResolveAliasMap, SubpathValue,
    },
    source::Source,
};
use turbopack_node::execution_context::ExecutionContext;

use crate::{
    embed_js::{next_js_fs, VIRTUAL_PACKAGE_NAME},
    mode::NextMode,
    next_client::context::ClientContextType,
    next_config::NextConfig,
    next_edge::unsupported::NextEdgeUnsupportedModuleReplacer,
    next_font::google::{
        NextFontGoogleCssModuleReplacer, NextFontGoogleFontFileReplacer, NextFontGoogleReplacer,
        GOOGLE_FONTS_INTERNAL_PREFIX,
    },
    next_server::context::ServerContextType,
    util::NextRuntime,
};

/// List of node.js internals that are not supported by edge runtime.
/// If these imports are used & user does not provide alias for the polyfill,
/// runtime error will be thrown.
/// This is not identical to the list of entire node.js internals, refer
/// https://vercel.com/docs/functions/runtimes/edge-runtime#compatible-node.js-modules
/// for the allowed imports.
const EDGE_UNSUPPORTED_NODE_INTERNALS: [&str; 44] = [
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "diagnostics_channel",
    "dns",
    "dns/promises",
    "domain",
    "fs",
    "fs/promises",
    "http",
    "http2",
    "https",
    "inspector",
    "module",
    "net",
    "os",
    "path",
    "path/posix",
    "path/win32",
    "perf_hooks",
    "process",
    "punycode",
    "querystring",
    "readline",
    "repl",
    "stream",
    "stream/promises",
    "stream/web",
    "string_decoder",
    "sys",
    "timers",
    "timers/promises",
    "tls",
    "trace_events",
    "tty",
    "v8",
    "vm",
    "wasi",
    "worker_threads",
    "zlib",
    "pnpapi",
];

// Make sure to not add any external requests here.
/// Computes the Next-specific client import map.
#[turbo_tasks::function]
pub async fn get_next_client_import_map(
    project_path: ResolvedVc<FileSystemPath>,
    ty: Value<ClientContextType>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    insert_next_shared_aliases(
        &mut import_map,
        project_path,
        execution_context,
        next_config,
        false,
    )
    .await?;

    insert_optimized_module_aliases(&mut import_map, project_path).await?;

    insert_alias_option(
        &mut import_map,
        project_path,
        next_config.resolve_alias_options(),
        ["browser"],
    )
    .await?;

    match ty.into_value() {
        ClientContextType::Pages { .. } => {}
        ClientContextType::App { app_dir } => {
            let react_flavor = if *next_config.enable_ppr().await?
                || *next_config.enable_taint().await?
                || *next_config.enable_react_owner_stack().await?
                || *next_config.enable_view_transition().await?
            {
                "-experimental"
            } else {
                ""
            };

            import_map.insert_exact_alias(
                "react",
                request_to_import_mapping(
                    app_dir,
                    &format!("next/dist/compiled/react{react_flavor}"),
                ),
            );
            import_map.insert_wildcard_alias(
                "react/",
                request_to_import_mapping(
                    app_dir,
                    &format!("next/dist/compiled/react{react_flavor}/*"),
                ),
            );
            import_map.insert_exact_alias(
                "react-dom",
                request_to_import_mapping(
                    app_dir,
                    &format!("next/dist/compiled/react-dom{react_flavor}"),
                ),
            );
            import_map.insert_exact_alias(
                "react-dom/static",
                request_to_import_mapping(
                    app_dir,
                    "next/dist/compiled/react-dom-experimental/static",
                ),
            );
            import_map.insert_exact_alias(
                "react-dom/static.edge",
                request_to_import_mapping(
                    app_dir,
                    "next/dist/compiled/react-dom-experimental/static.edge",
                ),
            );
            import_map.insert_exact_alias(
                "react-dom/static.browser",
                request_to_import_mapping(
                    app_dir,
                    "next/dist/compiled/react-dom-experimental/static.browser",
                ),
            );
            let react_client_package = get_react_client_package(next_config).await?;
            import_map.insert_exact_alias(
                "react-dom/client",
                request_to_import_mapping(
                    app_dir,
                    &format!("next/dist/compiled/react-dom{react_flavor}/{react_client_package}"),
                ),
            );
            import_map.insert_wildcard_alias(
                "react-dom/",
                request_to_import_mapping(
                    app_dir,
                    &format!("next/dist/compiled/react-dom{react_flavor}/*"),
                ),
            );
            import_map.insert_wildcard_alias(
                "react-server-dom-webpack/",
                request_to_import_mapping(app_dir, "react-server-dom-turbopack/*"),
            );
            import_map.insert_wildcard_alias(
                "react-server-dom-turbopack/",
                request_to_import_mapping(
                    app_dir,
                    &format!("next/dist/compiled/react-server-dom-turbopack{react_flavor}/*"),
                ),
            );
            import_map.insert_exact_alias(
                "next/head",
                request_to_import_mapping(project_path, "next/dist/client/components/noop-head"),
            );
            import_map.insert_exact_alias(
                "next/dynamic",
                request_to_import_mapping(project_path, "next/dist/shared/lib/app-dynamic"),
            );
            import_map.insert_exact_alias(
                "next/link",
                request_to_import_mapping(project_path, "next/dist/client/app-dir/link"),
            );
        }
        ClientContextType::Fallback => {}
        ClientContextType::Other => {}
    }

    // see https://github.com/vercel/next.js/blob/8013ef7372fc545d49dbd060461224ceb563b454/packages/next/src/build/webpack-config.ts#L1449-L1531
    insert_exact_alias_map(
        &mut import_map,
        project_path,
        fxindexmap! {
            "server-only" => "next/dist/compiled/server-only/index".to_string(),
            "client-only" => "next/dist/compiled/client-only/index".to_string(),
            "next/dist/compiled/server-only" => "next/dist/compiled/server-only/index".to_string(),
            "next/dist/compiled/client-only" => "next/dist/compiled/client-only/index".to_string(),
        },
    );

    match ty.into_value() {
        ClientContextType::Pages { .. }
        | ClientContextType::App { .. }
        | ClientContextType::Fallback => {
            for (original, alias) in NEXT_ALIASES {
                import_map.insert_exact_alias(
                    format!("node:{original}"),
                    request_to_import_mapping(project_path, alias),
                );
            }
        }
        ClientContextType::Other => {}
    }

    insert_turbopack_dev_alias(&mut import_map).await?;

    Ok(import_map.cell())
}

/// Computes the Next-specific client import map.
#[turbo_tasks::function]
pub async fn get_next_build_import_map() -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    insert_package_alias(
        &mut import_map,
        &format!("{VIRTUAL_PACKAGE_NAME}/"),
        next_js_fs().root().to_resolved().await?,
    );

    let external = ImportMapping::External(None, ExternalType::CommonJs, ExternalTraced::Traced)
        .resolved_cell();

    import_map.insert_exact_alias("next", external);
    import_map.insert_wildcard_alias("next/", external);
    import_map.insert_exact_alias("styled-jsx", external);
    import_map.insert_exact_alias(
        "styled-jsx/style",
        ImportMapping::External(
            Some("styled-jsx/style.js".into()),
            ExternalType::CommonJs,
            ExternalTraced::Traced,
        )
        .resolved_cell(),
    );
    import_map.insert_wildcard_alias("styled-jsx/", external);

    Ok(import_map.cell())
}

/// Computes the Next-specific client fallback import map, which provides
/// polyfills to Node.js externals.
#[turbo_tasks::function]
pub async fn get_next_client_fallback_import_map(
    ty: Value<ClientContextType>,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    match ty.into_value() {
        ClientContextType::Pages {
            pages_dir: context_dir,
        }
        | ClientContextType::App {
            app_dir: context_dir,
        } => {
            for (original, alias) in NEXT_ALIASES {
                import_map
                    .insert_exact_alias(original, request_to_import_mapping(context_dir, alias));
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
    project_path: ResolvedVc<FileSystemPath>,
    ty: Value<ServerContextType>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    insert_next_shared_aliases(
        &mut import_map,
        project_path,
        execution_context,
        next_config,
        false,
    )
    .await?;

    insert_alias_option(
        &mut import_map,
        project_path,
        next_config.resolve_alias_options(),
        [],
    )
    .await?;

    let ty = ty.into_value();

    let external = ImportMapping::External(None, ExternalType::CommonJs, ExternalTraced::Traced)
        .resolved_cell();

    import_map.insert_exact_alias("next/dist/server/require-hook", external);
    match ty {
        ServerContextType::Pages { .. }
        | ServerContextType::PagesData { .. }
        | ServerContextType::PagesApi { .. } => {
            import_map.insert_exact_alias("react", external);
            import_map.insert_wildcard_alias("react/", external);
            import_map.insert_exact_alias("react-dom", external);
            import_map.insert_exact_alias("react-dom/client", external);
            import_map.insert_wildcard_alias("react-dom/", external);
            import_map.insert_exact_alias("styled-jsx", external);
            import_map.insert_exact_alias(
                "styled-jsx/style",
                ImportMapping::External(
                    Some("styled-jsx/style.js".into()),
                    ExternalType::CommonJs,
                    ExternalTraced::Traced,
                )
                .resolved_cell(),
            );
            import_map.insert_wildcard_alias("styled-jsx/", external);
            // TODO: we should not bundle next/dist/build/utils in the pages renderer at all
            import_map.insert_wildcard_alias("next/dist/build/utils", external);
        }
        ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. } => {
            import_map.insert_exact_alias(
                "next/head",
                request_to_import_mapping(project_path, "next/dist/client/components/noop-head"),
            );
            import_map.insert_exact_alias(
                "next/dynamic",
                request_to_import_mapping(project_path, "next/dist/shared/lib/app-dynamic"),
            );
            import_map.insert_exact_alias(
                "next/link",
                request_to_import_mapping(project_path, "next/dist/client/app-dir/link"),
            )
        }
        ServerContextType::Middleware { .. } | ServerContextType::Instrumentation { .. } => {}
    }

    insert_next_server_special_aliases(
        &mut import_map,
        project_path,
        ty,
        NextRuntime::NodeJs,
        next_config,
    )
    .await?;

    Ok(import_map.cell())
}

/// Computes the Next-specific edge-side import map.
#[turbo_tasks::function]
pub async fn get_next_edge_import_map(
    project_path: ResolvedVc<FileSystemPath>,
    ty: Value<ServerContextType>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    // https://github.com/vercel/next.js/blob/786ef25e529e1fb2dda398aebd02ccbc8d0fb673/packages/next/src/build/webpack-config.ts#L815-L861

    // Alias next/dist imports to next/dist/esm assets
    insert_wildcard_alias_map(
        &mut import_map,
        project_path,
        fxindexmap! {
            "next/dist/build/" => "next/dist/esm/build/*".to_string(),
            "next/dist/client/" => "next/dist/esm/client/*".to_string(),
            "next/dist/shared/" => "next/dist/esm/shared/*".to_string(),
            "next/dist/pages/" => "next/dist/esm/pages/*".to_string(),
            "next/dist/lib/" => "next/dist/esm/lib/*".to_string(),
            "next/dist/server/" => "next/dist/esm/server/*".to_string(),
            "next/dist/api/" => "next/dist/esm/api/*".to_string(),
        },
    );

    // Alias the usage of next public APIs
    insert_exact_alias_map(
        &mut import_map,
        project_path,
        fxindexmap! {
            "next/app" => "next/dist/api/app".to_string(),
            "next/document" => "next/dist/api/document".to_string(),
            "next/dynamic" => "next/dist/api/dynamic".to_string(),
            "next/form" => "next/dist/api/form".to_string(),
            "next/head" => "next/dist/api/head".to_string(),
            "next/headers" => "next/dist/api/headers".to_string(),
            "next/image" => "next/dist/api/image".to_string(),
            "next/link" => "next/dist/api/link".to_string(),
            "next/navigation" => "next/dist/api/navigation".to_string(),
            "next/router" => "next/dist/api/router".to_string(),
            "next/script" => "next/dist/api/script".to_string(),
            "next/server" => "next/dist/api/server".to_string(),
            "next/og" => "next/dist/api/og".to_string(),

            // Alias built-in @vercel/og to edge bundle for edge runtime
            "next/dist/compiled/@vercel/og/index.node.js" => "next/dist/compiled/@vercel/og/index.edge.js".to_string(),
        },
    );

    insert_next_shared_aliases(
        &mut import_map,
        project_path,
        execution_context,
        next_config,
        true,
    )
    .await?;

    insert_optimized_module_aliases(&mut import_map, project_path).await?;

    insert_alias_option(
        &mut import_map,
        project_path,
        next_config.resolve_alias_options(),
        [],
    )
    .await?;

    let ty = ty.into_value();
    match ty {
        ServerContextType::Pages { .. }
        | ServerContextType::PagesData { .. }
        | ServerContextType::PagesApi { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. } => {}
        ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. } => {
            import_map.insert_exact_alias(
                "next/head",
                request_to_import_mapping(project_path, "next/dist/client/components/noop-head"),
            );
            import_map.insert_exact_alias(
                "next/dynamic",
                request_to_import_mapping(project_path, "next/dist/shared/lib/app-dynamic"),
            );
            import_map.insert_exact_alias(
                "next/link",
                request_to_import_mapping(project_path, "next/dist/client/app-dir/link"),
            )
        }
    }

    insert_next_server_special_aliases(
        &mut import_map,
        project_path,
        ty,
        NextRuntime::Edge,
        next_config,
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
        | ServerContextType::PagesData { .. }
        | ServerContextType::PagesApi { .. } => {
            insert_unsupported_node_internal_aliases(
                &mut import_map,
                *project_path,
                execution_context,
            )
            .await?;
        }
    }

    Ok(import_map.cell())
}

/// Insert default aliases for the node.js's internal to raise unsupported
/// runtime errors. User may provide polyfills for their own by setting user
/// config's alias.
async fn insert_unsupported_node_internal_aliases(
    import_map: &mut ImportMap,
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
) -> Result<()> {
    let unsupported_replacer = ImportMapping::Dynamic(ResolvedVc::upcast(
        NextEdgeUnsupportedModuleReplacer::new(project_path, execution_context)
            .to_resolved()
            .await?,
    ))
    .resolved_cell();

    EDGE_UNSUPPORTED_NODE_INTERNALS.iter().for_each(|module| {
        import_map.insert_alias(AliasPattern::exact(*module), unsupported_replacer);
    });
    Ok(())
}

pub fn get_next_client_resolved_map(
    _context: Vc<FileSystemPath>,
    _root: ResolvedVc<FileSystemPath>,
    _mode: NextMode,
) -> Vc<ResolvedMap> {
    let glob_mappings = vec![];
    ResolvedMap {
        by_glob: glob_mappings,
    }
    .cell()
}

static NEXT_ALIASES: [(&str, &str); 23] = [
    ("assert", "next/dist/compiled/assert"),
    ("buffer", "next/dist/compiled/buffer"),
    ("constants", "next/dist/compiled/constants-browserify"),
    ("crypto", "next/dist/compiled/crypto-browserify"),
    ("domain", "next/dist/compiled/domain-browser"),
    ("http", "next/dist/compiled/stream-http"),
    ("https", "next/dist/compiled/https-browserify"),
    ("os", "next/dist/compiled/os-browserify"),
    ("path", "next/dist/compiled/path-browserify"),
    ("punycode", "next/dist/compiled/punycode"),
    ("process", "next/dist/build/polyfills/process"),
    ("querystring", "next/dist/compiled/querystring-es3"),
    ("stream", "next/dist/compiled/stream-browserify"),
    ("string_decoder", "next/dist/compiled/string_decoder"),
    ("sys", "next/dist/compiled/util"),
    ("timers", "next/dist/compiled/timers-browserify"),
    ("tty", "next/dist/compiled/tty-browserify"),
    ("url", "next/dist/compiled/native-url"),
    ("util", "next/dist/compiled/util"),
    ("vm", "next/dist/compiled/vm-browserify"),
    ("zlib", "next/dist/compiled/browserify-zlib"),
    ("events", "next/dist/compiled/events"),
    ("setImmediate", "next/dist/compiled/setimmediate"),
];

async fn insert_next_server_special_aliases(
    import_map: &mut ImportMap,
    project_path: ResolvedVc<FileSystemPath>,
    ty: ServerContextType,
    runtime: NextRuntime,
    next_config: Vc<NextConfig>,
) -> Result<()> {
    let external_cjs_if_node =
        move |context_dir: ResolvedVc<FileSystemPath>, request: &str| match runtime {
            NextRuntime::Edge => request_to_import_mapping(context_dir, request),
            NextRuntime::NodeJs => external_request_to_cjs_import_mapping(context_dir, request),
        };
    let external_esm_if_node =
        move |context_dir: ResolvedVc<FileSystemPath>, request: &str| match runtime {
            NextRuntime::Edge => request_to_import_mapping(context_dir, request),
            NextRuntime::NodeJs => external_request_to_esm_import_mapping(context_dir, request),
        };

    import_map.insert_exact_alias(
        "next/dist/compiled/@vercel/og/index.node.js",
        external_esm_if_node(project_path, "next/dist/compiled/@vercel/og/index.node.js"),
    );

    import_map.insert_exact_alias(
        "next/dist/server/ReactDOMServerPages",
        ImportMapping::Alternatives(vec![
            request_to_import_mapping(project_path, "react-dom/server.edge"),
            request_to_import_mapping(project_path, "react-dom/server.browser"),
        ])
        .resolved_cell(),
    );

    import_map.insert_exact_alias(
        "@opentelemetry/api",
        // It needs to prefer the local version of @opentelemetry/api
        ImportMapping::Alternatives(vec![
            external_cjs_if_node(project_path, "@opentelemetry/api"),
            external_cjs_if_node(project_path, "next/dist/compiled/@opentelemetry/api"),
        ])
        .resolved_cell(),
    );

    match ty {
        ServerContextType::Pages { .. } | ServerContextType::PagesApi { .. } => {}
        ServerContextType::PagesData { .. } => {}
        // the logic closely follows the one in createRSCAliases in webpack-config.ts
        ServerContextType::AppSSR { app_dir }
        | ServerContextType::AppRSC { app_dir, .. }
        | ServerContextType::AppRoute { app_dir, .. } => {
            let next_package = get_next_package(*app_dir).to_resolved().await?;
            import_map.insert_exact_alias(
                "styled-jsx",
                request_to_import_mapping(next_package, "styled-jsx"),
            );
            import_map.insert_wildcard_alias(
                "styled-jsx/",
                request_to_import_mapping(next_package, "styled-jsx/*"),
            );

            rsc_aliases(import_map, project_path, ty, runtime, next_config).await?;
        }
        ServerContextType::Middleware { .. } | ServerContextType::Instrumentation { .. } => {
            rsc_aliases(import_map, project_path, ty, runtime, next_config).await?;
        }
    }

    // see https://github.com/vercel/next.js/blob/8013ef7372fc545d49dbd060461224ceb563b454/packages/next/src/build/webpack-config.ts#L1449-L1531
    // Sets runtime aliases for the import to client|server-only. Depends on the
    // context, it'll resolve to the noop where it's allowed, or aliased into
    // the error which throws a runtime error. This works with in combination of
    // build-time error as well, refer https://github.com/vercel/next.js/blob/0060de1c4905593ea875fa7250d4b5d5ce10897d/packages/next-swc/crates/next-core/src/next_server/context.rs#L103
    match ty {
        ServerContextType::Pages { .. } => {
            insert_exact_alias_map(
                import_map,
                project_path,
                fxindexmap! {
                    "server-only" => "next/dist/compiled/server-only/empty".to_string(),
                    "client-only" => "next/dist/compiled/client-only/index".to_string(),
                    "next/dist/compiled/server-only" => "next/dist/compiled/server-only/empty".to_string(),
                    "next/dist/compiled/client-only" => "next/dist/compiled/client-only/index".to_string(),
                },
            );
        }
        ServerContextType::PagesData { .. }
        | ServerContextType::PagesApi { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. } => {
            insert_exact_alias_map(
                import_map,
                project_path,
                fxindexmap! {
                    "server-only" => "next/dist/compiled/server-only/empty".to_string(),
                    "client-only" => "next/dist/compiled/client-only/error".to_string(),
                    "next/dist/compiled/server-only" => "next/dist/compiled/server-only/empty".to_string(),
                    "next/dist/compiled/client-only" => "next/dist/compiled/client-only/error".to_string(),
                },
            );
        }
        ServerContextType::AppSSR { .. } => {
            insert_exact_alias_map(
                import_map,
                project_path,
                fxindexmap! {
                    "server-only" => "next/dist/compiled/server-only/index".to_string(),
                    "client-only" => "next/dist/compiled/client-only/index".to_string(),
                    "next/dist/compiled/server-only" => "next/dist/compiled/server-only/index".to_string(),
                    "next/dist/compiled/client-only" => "next/dist/compiled/client-only/index".to_string(),
                },
            );
        }
    }

    import_map.insert_exact_alias(
        "@vercel/og",
        external_cjs_if_node(project_path, "next/dist/server/og/image-response"),
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

async fn rsc_aliases(
    import_map: &mut ImportMap,
    project_path: ResolvedVc<FileSystemPath>,
    ty: ServerContextType,
    runtime: NextRuntime,
    next_config: Vc<NextConfig>,
) -> Result<()> {
    let ppr = *next_config.enable_ppr().await?;
    let taint = *next_config.enable_taint().await?;
    let react_owner_stack = *next_config.enable_react_owner_stack().await?;
    let view_transition = *next_config.enable_view_transition().await?;
    let react_channel = if ppr || taint || react_owner_stack || view_transition {
        "-experimental"
    } else {
        ""
    };
    let react_client_package = get_react_client_package(next_config).await?;

    let mut alias = FxIndexMap::default();
    if matches!(
        ty,
        ServerContextType::AppSSR { .. }
            | ServerContextType::AppRSC { .. }
            | ServerContextType::AppRoute { .. }
    ) {
        alias.extend(fxindexmap! {
            "react" => format!("next/dist/compiled/react{react_channel}"),
            "react-dom" => format!("next/dist/compiled/react-dom{react_channel}"),
            "react/jsx-runtime" => format!("next/dist/compiled/react{react_channel}/jsx-runtime"),
            "react/jsx-dev-runtime" => format!("next/dist/compiled/react{react_channel}/jsx-dev-runtime"),
            "react/compiler-runtime" => format!("next/dist/compiled/react{react_channel}/compiler-runtime"),
            "react-dom/client" => format!("next/dist/compiled/react-dom{react_channel}/{react_client_package}"),
            "react-dom/static" => format!("next/dist/compiled/react-dom{react_channel}/static"),
            "react-dom/static.edge" => format!("next/dist/compiled/react-dom{react_channel}/static.edge"),
            "react-dom/static.browser" => format!("next/dist/compiled/react-dom{react_channel}/static.browser"),
            "react-dom/server" => format!("next/dist/compiled/react-dom{react_channel}/server"),
            "react-dom/server.edge" => format!("next/dist/compiled/react-dom{react_channel}/server.edge"),
            "react-dom/server.browser" => format!("next/dist/compiled/react-dom{react_channel}/server.browser"),
        });
    }
    alias.extend(fxindexmap! {
        "react-server-dom-webpack/client" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client"),
        "react-server-dom-webpack/client.edge" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client.edge"),
        "react-server-dom-webpack/server.edge" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.edge"),
        "react-server-dom-webpack/server.node" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node"),
        "react-server-dom-webpack/static.edge" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/static.edge"),
        "react-server-dom-turbopack/client" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client"),
        "react-server-dom-turbopack/client.edge" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client.edge"),
        "react-server-dom-turbopack/server.edge" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.edge"),
        "react-server-dom-turbopack/server.node" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node"),
        "react-server-dom-turbopack/static.edge" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/static.edge"),
    });

    if runtime == NextRuntime::NodeJs {
        match ty {
            ServerContextType::AppSSR { .. } => {
                alias.extend(fxindexmap! {
                    "react/jsx-runtime" => format!("next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime"),
                    "react/jsx-dev-runtime" => format!("next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime"),
                    "react/compiler-runtime" => format!("next/dist/server/route-modules/app-page/vendored/ssr/react-compiler-runtime"),
                    "react" => format!("next/dist/server/route-modules/app-page/vendored/ssr/react"),
                    "react-dom" => format!("next/dist/server/route-modules/app-page/vendored/ssr/react-dom"),
                    "react-server-dom-webpack/client.edge" => format!("next/dist/server/route-modules/app-page/vendored/ssr/react-server-dom-turbopack-client-edge"),
                    "react-server-dom-turbopack/client.edge" => format!("next/dist/server/route-modules/app-page/vendored/ssr/react-server-dom-turbopack-client-edge"),
                });
            }
            ServerContextType::AppRSC { .. }
            | ServerContextType::AppRoute { .. }
            | ServerContextType::Middleware { .. }
            | ServerContextType::Instrumentation { .. } => {
                alias.extend(fxindexmap! {
                    "react/jsx-runtime" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-runtime"),
                    "react/jsx-dev-runtime" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime"),
                    "react/compiler-runtime" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react-compiler-runtime"),
                    "react" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react"),
                    "react-dom" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react-dom"),
                    "react-server-dom-webpack/server.edge" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server-edge"),
                    "react-server-dom-webpack/server.node" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server-node"),
                    "react-server-dom-webpack/static.edge" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-static-edge"),
                    "react-server-dom-turbopack/server.edge" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server-edge"),
                    "react-server-dom-turbopack/server.node" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server-node"),
                    "react-server-dom-turbopack/static.edge" => format!("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-static-edge"),
                    "next/navigation" => format!("next/dist/api/navigation.react-server"),

                    // Needed to make `react-dom/server` work.
                    "next/dist/compiled/react" => format!("next/dist/compiled/react/index.js"),
                });
            }
            _ => {}
        }
    }

    if runtime == NextRuntime::Edge && ty.supports_react_server() {
        alias.extend(fxindexmap! {
            "react" => format!("next/dist/compiled/react{react_channel}/react.react-server"),
            "next/dist/compiled/react" => format!("next/dist/compiled/react{react_channel}/react.react-server"),
            "next/dist/compiled/react-experimental" =>  format!("next/dist/compiled/react-experimental/react.react-server"),
            "react/jsx-runtime" => format!("next/dist/compiled/react{react_channel}/jsx-runtime.react-server"),
            "react/compiler-runtime" => format!("next/dist/compiled/react{react_channel}/compiler-runtime"),
            "next/dist/compiled/react/jsx-runtime" => format!("next/dist/compiled/react{react_channel}/jsx-runtime.react-server"),
            "next/dist/compiled/react-experimental/jsx-runtime" => format!("next/dist/compiled/react-experimental/jsx-runtime.react-server"),
            "next/dist/compiled/react/compiler-runtime" => format!("next/dist/compiled/react{react_channel}/compiler-runtime"),
            "react/jsx-dev-runtime" => format!("next/dist/compiled/react{react_channel}/jsx-dev-runtime.react-server"),
            "next/dist/compiled/react/jsx-dev-runtime" => format!("next/dist/compiled/react{react_channel}/jsx-dev-runtime.react-server"),
            "next/dist/compiled/react-experimental/jsx-dev-runtime" => format!("next/dist/compiled/react-experimental/jsx-dev-runtime.react-server"),
            "react-dom" => format!("next/dist/compiled/react-dom{react_channel}/react-dom.react-server"),
            "next/dist/compiled/react-dom" => format!("next/dist/compiled/react-dom{react_channel}/react-dom.react-server"),
            "next/dist/compiled/react-dom-experimental" => format!("next/dist/compiled/react-dom-experimental/react-dom.react-server"),
            "next/navigation" => format!("next/dist/api/navigation.react-server"),
        })
    }

    insert_exact_alias_map(import_map, project_path, alias);

    Ok(())
}

pub fn mdx_import_source_file() -> RcStr {
    format!("{VIRTUAL_PACKAGE_NAME}/mdx-import-source").into()
}

// Insert aliases for Next.js stubs of fetch, object-assign, and url
// Keep in sync with getOptimizedModuleAliases in webpack-config.ts
async fn insert_optimized_module_aliases(
    import_map: &mut ImportMap,
    project_path: ResolvedVc<FileSystemPath>,
) -> Result<()> {
    insert_exact_alias_map(
        import_map,
        project_path,
        fxindexmap! {
            "unfetch" => "next/dist/build/polyfills/fetch/index.js".to_string(),
            "isomorphic-unfetch" => "next/dist/build/polyfills/fetch/index.js".to_string(),
            "whatwg-fetch" => "next/dist/build/polyfills/fetch/whatwg-fetch.js".to_string(),
            "object-assign" => "next/dist/build/polyfills/object-assign.js".to_string(),
            "object.assign/auto" => "next/dist/build/polyfills/object.assign/auto.js".to_string(),
            "object.assign/implementation" => "next/dist/build/polyfills/object.assign/implementation.js".to_string(),
            "object.assign/polyfill" => "next/dist/build/polyfills/object.assign/polyfill.js".to_string(),
            "object.assign/shim" => "next/dist/build/polyfills/object.assign/shim.js".to_string(),
            "url" => "next/dist/compiled/native-url".to_string(),
            "node:url" => "next/dist/compiled/native-url".to_string(),
        },
    );
    Ok(())
}

// Make sure to not add any external requests here.
async fn insert_next_shared_aliases(
    import_map: &mut ImportMap,
    project_path: ResolvedVc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    next_config: Vc<NextConfig>,
    is_runtime_edge: bool,
) -> Result<()> {
    let package_root = next_js_fs().root().to_resolved().await?;

    insert_alias_to_alternatives(
        import_map,
        mdx_import_source_file(),
        vec![
            request_to_import_mapping(project_path, "./mdx-components"),
            request_to_import_mapping(project_path, "./src/mdx-components"),
            request_to_import_mapping(project_path, "@mdx-js/react"),
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
        NextFontGoogleReplacer::new(*project_path)
            .to_resolved()
            .await?,
    ))
    .resolved_cell();

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact("next/font/google/target.css"),
        next_font_google_replacer_mapping,
    );

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact("@next/font/google/target.css"),
        next_font_google_replacer_mapping,
    );

    import_map.insert_alias(
        AliasPattern::exact("@vercel/turbopack-next/internal/font/google/cssmodule.module.css"),
        ImportMapping::Dynamic(ResolvedVc::upcast(
            NextFontGoogleCssModuleReplacer::new(*project_path, execution_context)
                .to_resolved()
                .await?,
        ))
        .resolved_cell(),
    );

    import_map.insert_alias(
        AliasPattern::exact(GOOGLE_FONTS_INTERNAL_PREFIX),
        ImportMapping::Dynamic(ResolvedVc::upcast(
            NextFontGoogleFontFileReplacer::new(*project_path)
                .to_resolved()
                .await?,
        ))
        .resolved_cell(),
    );

    let next_package = get_next_package(*project_path).to_resolved().await?;
    import_map.insert_singleton_alias("@swc/helpers", next_package);
    import_map.insert_singleton_alias("styled-jsx", next_package);
    import_map.insert_singleton_alias("next", project_path);
    import_map.insert_singleton_alias("react", project_path);
    import_map.insert_singleton_alias("react-dom", project_path);
    let react_client_package = get_react_client_package(next_config).await?;
    import_map.insert_exact_alias(
        "react-dom/client",
        request_to_import_mapping(project_path, &format!("react-dom/{react_client_package}")),
    );

    import_map.insert_alias(
        // Make sure you can't import custom server as it'll cause all Next.js internals to be
        // bundled which doesn't work.
        AliasPattern::exact("next"),
        ImportMapping::Empty.resolved_cell(),
    );

    //https://github.com/vercel/next.js/blob/f94d4f93e4802f951063cfa3351dd5a2325724b3/packages/next/src/build/webpack-config.ts#L1196
    import_map.insert_exact_alias(
        "setimmediate",
        request_to_import_mapping(project_path, "next/dist/compiled/setimmediate"),
    );

    import_map.insert_exact_alias(
        "private-next-rsc-server-reference",
        request_to_import_mapping(
            project_path,
            "next/dist/build/webpack/loaders/next-flight-loader/server-reference",
        ),
    );
    import_map.insert_exact_alias(
        "private-next-rsc-action-client-wrapper",
        request_to_import_mapping(
            project_path,
            "next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper",
        ),
    );
    import_map.insert_exact_alias(
        "private-next-rsc-action-validate",
        request_to_import_mapping(
            project_path,
            "next/dist/build/webpack/loaders/next-flight-loader/action-validate",
        ),
    );
    import_map.insert_exact_alias(
        "private-next-rsc-action-encryption",
        request_to_import_mapping(project_path, "next/dist/server/app-render/encryption"),
    );
    import_map.insert_exact_alias(
        "private-next-rsc-cache-wrapper",
        request_to_import_mapping(
            project_path,
            "next/dist/build/webpack/loaders/next-flight-loader/cache-wrapper",
        ),
    );

    insert_turbopack_dev_alias(import_map).await?;
    insert_package_alias(
        import_map,
        "@vercel/turbopack-node/",
        turbopack_node::embed_js::embed_fs()
            .root()
            .to_resolved()
            .await?,
    );

    let image_config = next_config.image_config().await?;
    if let Some(loader_file) = image_config.loader_file.as_deref() {
        import_map.insert_exact_alias(
            "next/dist/shared/lib/image-loader",
            request_to_import_mapping(project_path, loader_file),
        );

        if is_runtime_edge {
            import_map.insert_exact_alias(
                "next/dist/esm/shared/lib/image-loader",
                request_to_import_mapping(project_path, loader_file),
            );
        }
    }

    Ok(())
}

#[turbo_tasks::function]
pub async fn get_next_package(context_directory: Vc<FileSystemPath>) -> Result<Vc<FileSystemPath>> {
    let result = resolve(
        context_directory,
        Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined)),
        Request::parse(Value::new(Pattern::Constant("next/package.json".into()))),
        node_cjs_resolve_options(context_directory.root()),
    );
    let source = result
        .first_source()
        .await?
        .context("Next.js package not found")?;
    Ok(source.ident().path().parent())
}

pub async fn insert_alias_option<const N: usize>(
    import_map: &mut ImportMap,
    project_path: ResolvedVc<FileSystemPath>,
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
    project_path: ResolvedVc<FileSystemPath>,
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
            ImportMapping::PrimaryAlternative(result[0].0.into(), Some(project_path))
                .resolved_cell()
        } else {
            ImportMapping::Alternatives(
                result
                    .iter()
                    .map(|(m, _)| {
                        ImportMapping::PrimaryAlternative((*m).into(), Some(project_path))
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
    project_path: ResolvedVc<FileSystemPath>,
    map: FxIndexMap<&'static str, String>,
) {
    for (pattern, request) in map {
        import_map.insert_exact_alias(pattern, request_to_import_mapping(project_path, &request));
    }
}

fn insert_wildcard_alias_map(
    import_map: &mut ImportMap,
    project_path: ResolvedVc<FileSystemPath>,
    map: FxIndexMap<&'static str, String>,
) {
    for (pattern, request) in map {
        import_map
            .insert_wildcard_alias(pattern, request_to_import_mapping(project_path, &request));
    }
}

/// Inserts an alias to an alternative of import mappings into an import map.
fn insert_alias_to_alternatives<'a>(
    import_map: &mut ImportMap,
    alias: impl Into<String> + 'a,
    alternatives: Vec<ResolvedVc<ImportMapping>>,
) {
    import_map.insert_exact_alias(
        alias.into(),
        ImportMapping::Alternatives(alternatives).resolved_cell(),
    );
}

/// Inserts an alias to an import mapping into an import map.
fn insert_package_alias(
    import_map: &mut ImportMap,
    prefix: &str,
    package_root: ResolvedVc<FileSystemPath>,
) {
    import_map.insert_wildcard_alias(
        prefix,
        ImportMapping::PrimaryAlternative("./*".into(), Some(package_root)).resolved_cell(),
    );
}

/// Inserts an alias to @vercel/turbopack-dev into an import map.
async fn insert_turbopack_dev_alias(import_map: &mut ImportMap) -> Result<()> {
    insert_package_alias(
        import_map,
        "@vercel/turbopack-ecmascript-runtime/",
        turbopack_ecmascript_runtime::embed_fs()
            .root()
            .to_resolved()
            .await?,
    );
    Ok(())
}

/// Creates a direct import mapping to the result of resolving a request
/// in a context.
fn request_to_import_mapping(
    context_path: ResolvedVc<FileSystemPath>,
    request: &str,
) -> ResolvedVc<ImportMapping> {
    ImportMapping::PrimaryAlternative(request.into(), Some(context_path)).resolved_cell()
}

/// Creates a direct import mapping to the result of resolving an external
/// request.
fn external_request_to_cjs_import_mapping(
    context_dir: ResolvedVc<FileSystemPath>,
    request: &str,
) -> ResolvedVc<ImportMapping> {
    ImportMapping::PrimaryAlternativeExternal {
        name: Some(request.into()),
        ty: ExternalType::CommonJs,
        traced: ExternalTraced::Traced,
        lookup_dir: context_dir,
    }
    .resolved_cell()
}

/// Creates a direct import mapping to the result of resolving an external
/// request.
fn external_request_to_esm_import_mapping(
    context_dir: ResolvedVc<FileSystemPath>,
    request: &str,
) -> ResolvedVc<ImportMapping> {
    ImportMapping::PrimaryAlternativeExternal {
        name: Some(request.into()),
        ty: ExternalType::EcmaScriptModule,
        traced: ExternalTraced::Traced,
        lookup_dir: context_dir,
    }
    .resolved_cell()
}
