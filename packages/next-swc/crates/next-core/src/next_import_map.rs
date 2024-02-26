use std::collections::{BTreeMap, HashMap};

use anyhow::{Context, Result};
use indexmap::{indexmap, IndexMap};
use turbo_tasks::{Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{FileSystem, FileSystemPath},
    turbopack::{
        core::{
            reference_type::{CommonJsReferenceSubType, ReferenceType},
            resolve::{
                options::{ConditionValue, ImportMap, ImportMapping, ResolveOptions, ResolvedMap},
                parse::Request,
                pattern::Pattern,
                resolve, AliasPattern, ExternalType, ResolveAliasMap, SubpathValue,
            },
            source::Source,
        },
        node::execution_context::ExecutionContext,
        turbopack::{resolve_options, resolve_options_context::ResolveOptionsContext},
    },
};

use crate::{
    embed_js::{next_js_fs, VIRTUAL_PACKAGE_NAME},
    mode::NextMode,
    next_client::context::ClientContextType,
    next_config::NextConfig,
    next_font::{
        google::{
            NextFontGoogleCssModuleReplacer, NextFontGoogleFontFileReplacer, NextFontGoogleReplacer,
        },
        local::{
            NextFontLocalCssModuleReplacer, NextFontLocalFontFileReplacer, NextFontLocalReplacer,
        },
    },
    next_server::context::ServerContextType,
    util::NextRuntime,
};

// Make sure to not add any external requests here.
/// Computes the Next-specific client import map.
#[turbo_tasks::function]
pub async fn get_next_client_import_map(
    project_path: Vc<FileSystemPath>,
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
            let react_flavor =
                if *next_config.enable_ppr().await? || *next_config.enable_taint().await? {
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
        }
        ClientContextType::Fallback => {}
        ClientContextType::Other => {}
    }

    // see https://github.com/vercel/next.js/blob/8013ef7372fc545d49dbd060461224ceb563b454/packages/next/src/build/webpack-config.ts#L1449-L1531
    insert_exact_alias_map(
        &mut import_map,
        project_path,
        indexmap! {
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

    insert_turbopack_dev_alias(&mut import_map);

    Ok(import_map.cell())
}

/// Computes the Next-specific client import map.
#[turbo_tasks::function]
pub fn get_next_build_import_map() -> Vc<ImportMap> {
    let mut import_map = ImportMap::empty();

    insert_package_alias(
        &mut import_map,
        &format!("{VIRTUAL_PACKAGE_NAME}/"),
        next_js_fs().root(),
    );

    let external = ImportMapping::External(None, ExternalType::CommonJs).cell();

    import_map.insert_exact_alias("next", external);
    import_map.insert_wildcard_alias("next/", external);
    import_map.insert_exact_alias("styled-jsx", external);
    import_map.insert_exact_alias(
        "styled-jsx/style",
        ImportMapping::External(
            Some("styled-jsx/style.js".to_string()),
            ExternalType::CommonJs,
        )
        .cell(),
    );
    import_map.insert_wildcard_alias("styled-jsx/", external);

    import_map.cell()
}

/// Computes the Next-specific client fallback import map, which provides
/// polyfills to Node.js externals.
#[turbo_tasks::function]
pub fn get_next_client_fallback_import_map(ty: Value<ClientContextType>) -> Vc<ImportMap> {
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

    insert_turbopack_dev_alias(&mut import_map);

    import_map.cell()
}

/// Computes the Next-specific server-side import map.
#[turbo_tasks::function]
pub async fn get_next_server_import_map(
    project_path: Vc<FileSystemPath>,
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

    let external: Vc<ImportMapping> = ImportMapping::External(None, ExternalType::CommonJs).cell();

    import_map.insert_exact_alias("next/dist/server/require-hook", external);
    match ty {
        ServerContextType::Pages { .. }
        | ServerContextType::PagesData { .. }
        | ServerContextType::PagesApi { .. } => {
            import_map.insert_exact_alias("react", external);
            import_map.insert_wildcard_alias("react/", external);
            import_map.insert_exact_alias("react-dom", external);
            import_map.insert_wildcard_alias("react-dom/", external);
            import_map.insert_exact_alias("styled-jsx", external);
            import_map.insert_exact_alias(
                "styled-jsx/style",
                ImportMapping::External(
                    Some("styled-jsx/style.js".to_string()),
                    ExternalType::CommonJs,
                )
                .cell(),
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
        }
        ServerContextType::Middleware | ServerContextType::Instrumentation => {}
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
    project_path: Vc<FileSystemPath>,
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
        indexmap! {
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
        indexmap! {
            "next/app" => "next/dist/api/app".to_string(),
            "next/document" => "next/dist/api/document".to_string(),
            "next/dynamic" => "next/dist/api/dynamic".to_string(),
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
        | ServerContextType::PagesApi { .. } => {}
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
        }
        ServerContextType::Middleware | ServerContextType::Instrumentation => {}
    }

    insert_next_server_special_aliases(
        &mut import_map,
        project_path,
        ty,
        NextRuntime::Edge,
        next_config,
    )
    .await?;

    Ok(import_map.cell())
}

pub fn get_next_client_resolved_map(
    _context: Vc<FileSystemPath>,
    _root: Vc<FileSystemPath>,
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
    project_path: Vc<FileSystemPath>,
    ty: ServerContextType,
    runtime: NextRuntime,
    next_config: Vc<NextConfig>,
) -> Result<()> {
    let external_if_node = move |context_dir: Vc<FileSystemPath>, request: &str| match runtime {
        NextRuntime::Edge => request_to_import_mapping(context_dir, request),
        NextRuntime::NodeJs => external_request_to_import_mapping(request),
    };

    import_map.insert_exact_alias(
        "@opentelemetry/api",
        // TODO(WEB-625) this actually need to prefer the local version of
        // @opentelemetry/api
        external_if_node(project_path, "next/dist/compiled/@opentelemetry/api"),
    );

    match ty {
        ServerContextType::Pages { .. } | ServerContextType::PagesApi { .. } => {}
        ServerContextType::PagesData { .. } => {}
        // the logic closely follows the one in createRSCAliases in webpack-config.ts
        ServerContextType::AppSSR { app_dir }
        | ServerContextType::AppRSC { app_dir, .. }
        | ServerContextType::AppRoute { app_dir } => {
            import_map.insert_exact_alias(
                "styled-jsx",
                request_to_import_mapping(get_next_package(app_dir), "styled-jsx"),
            );
            import_map.insert_wildcard_alias(
                "styled-jsx/",
                request_to_import_mapping(get_next_package(app_dir), "styled-jsx/*"),
            );

            rsc_aliases(import_map, project_path, ty, runtime, next_config).await?;
        }
        ServerContextType::Middleware | ServerContextType::Instrumentation => {}
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
                indexmap! {
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
        | ServerContextType::Instrumentation => {
            insert_exact_alias_map(
                import_map,
                project_path,
                indexmap! {
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
                indexmap! {
                    "server-only" => "next/dist/compiled/server-only/index".to_string(),
                    "client-only" => "next/dist/compiled/client-only/index".to_string(),
                    "next/dist/compiled/server-only" => "next/dist/compiled/server-only/index".to_string(),
                    "next/dist/compiled/client-only" => "next/dist/compiled/client-only/index".to_string(),
                },
            );
        }
        // Potential the bundle introduced into middleware and api can be poisoned by
        // client-only but not being used, so we disabled the `client-only` erroring
        // on these layers. `server-only` is still available.
        ServerContextType::Middleware => {
            insert_exact_alias_map(
                import_map,
                project_path,
                indexmap! {
                    "server-only" => "next/dist/compiled/server-only/empty".to_string(),
                    "client-only" => "next/dist/compiled/client-only/index".to_string(),
                    "next/dist/compiled/server-only" => "next/dist/compiled/server-only/empty".to_string(),
                    "next/dist/compiled/client-only" => "next/dist/compiled/client-only/index".to_string(),
                    "next/dist/compiled/client-only/error" => "next/dist/compiled/client-only/index".to_string(),
                },
            );
        }
    }

    import_map.insert_exact_alias(
        "@vercel/og",
        external_if_node(project_path, "next/dist/server/og/image-response"),
    );

    Ok(())
}

async fn rsc_aliases(
    import_map: &mut ImportMap,
    project_path: Vc<FileSystemPath>,
    ty: ServerContextType,
    runtime: NextRuntime,
    next_config: Vc<NextConfig>,
) -> Result<()> {
    let ppr = *next_config.enable_ppr().await?;
    let taint = *next_config.enable_taint().await?;
    let react_channel = if ppr || taint { "-experimental" } else { "" };

    let mut alias = indexmap! {
        "react" => format!("next/dist/compiled/react{react_channel}"),
        "react-dom" => format!("next/dist/compiled/react-dom{react_channel}"),
        "react/jsx-runtime" => format!("next/dist/compiled/react{react_channel}/jsx-runtime"),
        "react/jsx-dev-runtime" => format!("next/dist/compiled/react{react_channel}/jsx-dev-runtime"),
        "react-dom/client" => format!("next/dist/compiled/react-dom{react_channel}/client"),
        "react-dom/static" => format!("next/dist/compiled/react-dom-experimental/static"),
        "react-dom/static.edge" => format!("next/dist/compiled/react-dom-experimental/static.edge"),
        "react-dom/static.browser" => format!("next/dist/compiled/react-dom-experimental/static.browser"),
        "react-dom/server" => format!("next/dist/compiled/react-dom{react_channel}/server"),
        "react-dom/server.edge" => format!("next/dist/compiled/react-dom{react_channel}/server.edge"),
        "react-dom/server.browser" => format!("next/dist/compiled/react-dom{react_channel}/server.browser"),
        "react-server-dom-webpack/client" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client"),
        "react-server-dom-webpack/client.edge" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client.edge"),
        "react-server-dom-webpack/server.edge" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.edge"),
        "react-server-dom-webpack/server.node" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node"),
        "react-server-dom-turbopack/client" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client"),
        "react-server-dom-turbopack/client.edge" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/client.edge"),
        "react-server-dom-turbopack/server.edge" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.edge"),
        "react-server-dom-turbopack/server.node" => format!("next/dist/compiled/react-server-dom-turbopack{react_channel}/server.node"),
    };

    if runtime == NextRuntime::NodeJs {
        if let ServerContextType::AppSSR { .. } = ty {
            alias.extend(indexmap! {
                "react/jsx-runtime" => format!("next/dist/server/future/route-modules/app-page/vendored/ssr/react-jsx-runtime"),
                "react/jsx-dev-runtime" => format!("next/dist/server/future/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime"),
                "react" => format!("next/dist/server/future/route-modules/app-page/vendored/ssr/react"),
                "react-dom" => format!("next/dist/server/future/route-modules/app-page/vendored/ssr/react-dom"),
                "react-server-dom-webpack/client.edge" => format!("next/dist/server/future/route-modules/app-page/vendored/ssr/react-server-dom-turbopack-client-edge"),
                "react-server-dom-turbopack/client.edge" => format!("next/dist/server/future/route-modules/app-page/vendored/ssr/react-server-dom-turbopack-client-edge"),
            })
        }

        if let ServerContextType::AppRSC { .. } = ty {
            alias.extend(indexmap! {
                "react/jsx-runtime" => format!("next/dist/server/future/route-modules/app-page/vendored/rsc/react-jsx-runtime"),
                "react/jsx-dev-runtime" => format!("next/dist/server/future/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime"),
                "react" => format!("next/dist/server/future/route-modules/app-page/vendored/rsc/react"),
                "react-dom" => format!("next/dist/server/future/route-modules/app-page/vendored/rsc/react-dom"),
                "react-server-dom-webpack/server.edge" => format!("next/dist/server/future/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server-edge"),
                "react-server-dom-webpack/server.node" => format!("next/dist/server/future/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server-node"),
                "react-server-dom-turbopack/server.edge" => format!("next/dist/server/future/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server-edge"),
                "react-server-dom-turbopack/server.node" => format!("next/dist/server/future/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server-node"),

                // Needed to make `react-dom/server` work.
                "next/dist/compiled/react" => format!("next/dist/compiled/react/index.js"),
            })
        }
    }

    if runtime == NextRuntime::Edge {
        if matches!(ty, ServerContextType::AppRSC { .. }) {
            alias["react"] = format!("next/dist/compiled/react{react_channel}/react.react-server");
        }
        // Use server rendering stub for RSC and SSR
        // x-ref: https://github.com/facebook/react/pull/25436
        alias["react-dom"] =
            format!("next/dist/compiled/react-dom{react_channel}/server-rendering-stub");
    }

    insert_exact_alias_map(import_map, project_path, alias);

    Ok(())
}

pub fn mdx_import_source_file() -> String {
    format!("{VIRTUAL_PACKAGE_NAME}/mdx-import-source")
}

// Insert aliases for Next.js stubs of fetch, object-assign, and url
// Keep in sync with getOptimizedModuleAliases in webpack-config.ts
async fn insert_optimized_module_aliases(
    import_map: &mut ImportMap,
    project_path: Vc<FileSystemPath>,
) -> Result<()> {
    insert_exact_alias_map(
        import_map,
        project_path,
        indexmap! {
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
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    next_config: Vc<NextConfig>,
    is_runtime_edge: bool,
) -> Result<()> {
    let package_root = next_js_fs().root();

    if *next_config.mdx_rs().await? {
        insert_alias_to_alternatives(
            import_map,
            mdx_import_source_file(),
            vec![
                request_to_import_mapping(project_path, "./mdx-components"),
                request_to_import_mapping(project_path, "./src/mdx-components"),
                request_to_import_mapping(project_path, "@mdx-js/react"),
            ],
        );
    }

    insert_package_alias(
        import_map,
        &format!("{VIRTUAL_PACKAGE_NAME}/"),
        package_root,
    );

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact("next/font/google/target.css"),
        ImportMapping::Dynamic(Vc::upcast(NextFontGoogleReplacer::new(project_path))).into(),
    );

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact("@next/font/google/target.css"),
        ImportMapping::Dynamic(Vc::upcast(NextFontGoogleReplacer::new(project_path))).into(),
    );

    import_map.insert_alias(
        AliasPattern::exact("@vercel/turbopack-next/internal/font/google/cssmodule.module.css"),
        ImportMapping::Dynamic(Vc::upcast(NextFontGoogleCssModuleReplacer::new(
            project_path,
            execution_context,
        )))
        .into(),
    );

    import_map.insert_alias(
        AliasPattern::exact("@vercel/turbopack-next/internal/font/google/font"),
        ImportMapping::Dynamic(Vc::upcast(NextFontGoogleFontFileReplacer::new(
            project_path,
        )))
        .into(),
    );

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact("next/font/local/target.css"),
        ImportMapping::Dynamic(Vc::upcast(NextFontLocalReplacer::new(project_path))).into(),
    );

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact("@next/font/local/target.css"),
        ImportMapping::Dynamic(Vc::upcast(NextFontLocalReplacer::new(project_path))).into(),
    );

    import_map.insert_alias(
        AliasPattern::exact("@vercel/turbopack-next/internal/font/local/cssmodule.module.css"),
        ImportMapping::Dynamic(Vc::upcast(NextFontLocalCssModuleReplacer::new(
            project_path,
        )))
        .into(),
    );

    import_map.insert_alias(
        AliasPattern::exact("@vercel/turbopack-next/internal/font/local/font"),
        ImportMapping::Dynamic(Vc::upcast(NextFontLocalFontFileReplacer::new(project_path))).into(),
    );

    import_map.insert_singleton_alias("@swc/helpers", get_next_package(project_path));
    import_map.insert_singleton_alias("styled-jsx", get_next_package(project_path));
    import_map.insert_singleton_alias("next", project_path);
    import_map.insert_singleton_alias("react", project_path);
    import_map.insert_singleton_alias("react-dom", project_path);

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
        request_to_import_mapping(
            project_path,
            "next/dist/server/app-render/action-encryption",
        ),
    );

    insert_turbopack_dev_alias(import_map);
    insert_package_alias(
        import_map,
        "@vercel/turbopack-node/",
        turbopack_binding::turbopack::node::embed_js::embed_fs().root(),
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
async fn package_lookup_resolve_options(
    project_path: Vc<FileSystemPath>,
) -> Result<Vc<ResolveOptions>> {
    Ok(resolve_options(
        project_path,
        ResolveOptionsContext {
            enable_node_modules: Some(project_path.root().resolve().await?),
            enable_node_native_modules: true,
            custom_conditions: vec!["development".to_string()],
            ..Default::default()
        }
        .cell(),
    ))
}

#[turbo_tasks::function]
pub async fn get_next_package(context_directory: Vc<FileSystemPath>) -> Result<Vc<FileSystemPath>> {
    let result = resolve(
        context_directory,
        Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined)),
        Request::parse(Value::new(Pattern::Constant(
            "next/package.json".to_string(),
        ))),
        package_lookup_resolve_options(context_directory),
    );
    let source = result
        .first_source()
        .await?
        .context("Next.js package not found")?;
    Ok(source.ident().path().parent())
}

pub async fn insert_alias_option<const N: usize>(
    import_map: &mut ImportMap,
    project_path: Vc<FileSystemPath>,
    alias_options: Vc<ResolveAliasMap>,
    conditions: [&'static str; N],
) -> Result<()> {
    let conditions = BTreeMap::from(conditions.map(|c| (c.to_string(), ConditionValue::Set)));
    for (alias, value) in &alias_options.await? {
        if let Some(mapping) = export_value_to_import_mapping(value, &conditions, project_path) {
            import_map.insert_alias(alias, mapping);
        }
    }
    Ok(())
}

fn export_value_to_import_mapping(
    value: &SubpathValue,
    conditions: &BTreeMap<String, ConditionValue>,
    project_path: Vc<FileSystemPath>,
) -> Option<Vc<ImportMapping>> {
    let mut result = Vec::new();
    value.add_results(
        conditions,
        &ConditionValue::Unset,
        &mut HashMap::new(),
        &mut result,
    );
    if result.is_empty() {
        None
    } else {
        Some(if result.len() == 1 {
            ImportMapping::PrimaryAlternative(result[0].0.to_string(), Some(project_path)).cell()
        } else {
            ImportMapping::Alternatives(
                result
                    .iter()
                    .map(|(m, _)| {
                        ImportMapping::PrimaryAlternative(m.to_string(), Some(project_path)).cell()
                    })
                    .collect(),
            )
            .cell()
        })
    }
}

fn insert_exact_alias_map(
    import_map: &mut ImportMap,
    project_path: Vc<FileSystemPath>,
    map: IndexMap<&'static str, String>,
) {
    for (pattern, request) in map {
        import_map.insert_exact_alias(pattern, request_to_import_mapping(project_path, &request));
    }
}

fn insert_wildcard_alias_map(
    import_map: &mut ImportMap,
    project_path: Vc<FileSystemPath>,
    map: IndexMap<&'static str, String>,
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
    alternatives: Vec<Vc<ImportMapping>>,
) {
    import_map.insert_exact_alias(alias, ImportMapping::Alternatives(alternatives).into());
}

/// Inserts an alias to an import mapping into an import map.
fn insert_package_alias(
    import_map: &mut ImportMap,
    prefix: &str,
    package_root: Vc<FileSystemPath>,
) {
    import_map.insert_wildcard_alias(
        prefix,
        ImportMapping::PrimaryAlternative("./*".to_string(), Some(package_root)).cell(),
    );
}

/// Inserts an alias to @vercel/turbopack-dev into an import map.
fn insert_turbopack_dev_alias(import_map: &mut ImportMap) {
    insert_package_alias(
        import_map,
        "@vercel/turbopack-ecmascript-runtime/",
        turbopack_binding::turbopack::ecmascript_runtime::embed_fs().root(),
    );
}

/// Creates a direct import mapping to the result of resolving a request
/// in a context.
fn request_to_import_mapping(context_path: Vc<FileSystemPath>, request: &str) -> Vc<ImportMapping> {
    ImportMapping::PrimaryAlternative(request.to_string(), Some(context_path)).cell()
}

/// Creates a direct import mapping to the result of resolving an external
/// request.
fn external_request_to_import_mapping(request: &str) -> Vc<ImportMapping> {
    ImportMapping::External(Some(request.to_string()), ExternalType::CommonJs).into()
}
