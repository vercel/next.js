use std::collections::{BTreeMap, HashMap};

use anyhow::{Context, Result};
use turbo_binding::{
    turbo::tasks_fs::{glob::GlobVc, FileSystem, FileSystemPathVc},
    turbopack::{
        core::{
            asset::Asset,
            resolve::{
                options::{
                    ConditionValue, ImportMap, ImportMapVc, ImportMapping, ImportMappingVc,
                    ResolveOptionsVc, ResolvedMap, ResolvedMapVc,
                },
                parse::RequestVc,
                pattern::Pattern,
                resolve, AliasPattern, ExportsValue, ResolveAliasMapVc,
            },
        },
        node::execution_context::ExecutionContextVc,
        turbopack::{resolve_options, resolve_options_context::ResolveOptionsContext},
    },
};
use turbo_tasks::Value;

use crate::{
    embed_js::{next_js_fs, VIRTUAL_PACKAGE_NAME},
    next_client::context::ClientContextType,
    next_config::NextConfigVc,
    next_font::{
        google::{NextFontGoogleCssModuleReplacerVc, NextFontGoogleReplacerVc},
        local::{NextFontLocalCssModuleReplacerVc, NextFontLocalReplacerVc},
    },
    next_server::context::ServerContextType,
};

/// Computes the Next-specific client import map.
#[turbo_tasks::function]
pub async fn get_next_client_import_map(
    project_path: FileSystemPathVc,
    ty: Value<ClientContextType>,
    next_config: NextConfigVc,
    execution_context: ExecutionContextVc,
) -> Result<ImportMapVc> {
    let mut import_map = ImportMap::empty();

    insert_next_shared_aliases(&mut import_map, project_path, execution_context).await?;

    insert_alias_option(
        &mut import_map,
        project_path,
        next_config.resolve_alias_options(),
        ["browser"],
    )
    .await?;

    match ty.into_value() {
        ClientContextType::Pages { pages_dir } => {
            insert_alias_to_alternatives(
                &mut import_map,
                format!("{VIRTUAL_PACKAGE_NAME}/pages/_app"),
                vec![
                    request_to_import_mapping(pages_dir, "./_app"),
                    request_to_import_mapping(pages_dir, "next/app"),
                ],
            );
            insert_alias_to_alternatives(
                &mut import_map,
                format!("{VIRTUAL_PACKAGE_NAME}/pages/_document"),
                vec![
                    request_to_import_mapping(pages_dir, "./_document"),
                    request_to_import_mapping(pages_dir, "next/document"),
                ],
            );
            insert_alias_to_alternatives(
                &mut import_map,
                format!("{VIRTUAL_PACKAGE_NAME}/internal/_error"),
                vec![
                    request_to_import_mapping(pages_dir, "./_error"),
                    request_to_import_mapping(pages_dir, "next/error"),
                ],
            );
        }
        ClientContextType::App { app_dir } => {
            import_map.insert_exact_alias(
                "react",
                request_to_import_mapping(app_dir, "next/dist/compiled/react"),
            );
            import_map.insert_wildcard_alias(
                "react/",
                request_to_import_mapping(app_dir, "next/dist/compiled/react/*"),
            );
            import_map.insert_exact_alias(
                "react-dom",
                request_to_import_mapping(app_dir, "next/dist/compiled/react-dom"),
            );
            import_map.insert_wildcard_alias(
                "react-dom/",
                request_to_import_mapping(app_dir, "next/dist/compiled/react-dom/*"),
            );
        }
        ClientContextType::Fallback => {}
        ClientContextType::Other => {}
    }

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

    insert_package_alias(
        &mut import_map,
        "@vercel/turbopack-dev/",
        turbo_binding::turbopack::dev::embed_js::embed_fs().root(),
    );

    Ok(import_map.cell())
}

/// Computes the Next-specific client import map.
#[turbo_tasks::function]
pub fn get_next_build_import_map() -> ImportMapVc {
    let mut import_map = ImportMap::empty();

    insert_package_alias(
        &mut import_map,
        &format!("{VIRTUAL_PACKAGE_NAME}/"),
        next_js_fs().root(),
    );

    let external = ImportMapping::External(None).cell();

    import_map.insert_exact_alias("next", external);
    import_map.insert_wildcard_alias("next/", external);
    import_map.insert_exact_alias("styled-jsx", external);
    import_map.insert_wildcard_alias("styled-jsx/", external);

    import_map.cell()
}

/// Computes the Next-specific client fallback import map, which provides
/// polyfills to Node.js externals.
#[turbo_tasks::function]
pub fn get_next_client_fallback_import_map(ty: Value<ClientContextType>) -> ImportMapVc {
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

    insert_package_alias(
        &mut import_map,
        "@vercel/turbopack-dev/",
        turbo_binding::turbopack::dev::embed_js::embed_fs().root(),
    );

    import_map.cell()
}

/// Computes the Next-specific server-side import map.
#[turbo_tasks::function]
pub async fn get_next_server_import_map(
    project_path: FileSystemPathVc,
    ty: Value<ServerContextType>,
    next_config: NextConfigVc,
    execution_context: ExecutionContextVc,
) -> Result<ImportMapVc> {
    let mut import_map = ImportMap::empty();

    insert_next_shared_aliases(&mut import_map, project_path, execution_context).await?;

    insert_alias_option(
        &mut import_map,
        project_path,
        next_config.resolve_alias_options(),
        [],
    )
    .await?;

    import_map.insert_exact_alias(
        "@opentelemetry/api",
        // TODO(WEB-625) this actually need to prefer the local version of @opentelemetry/api
        ImportMapping::External(Some("next/dist/compiled/@opentelemetry/api".to_string())).into(),
    );

    let ty = ty.into_value();

    insert_next_server_special_aliases(&mut import_map, ty).await?;
    let external = ImportMapping::External(None).cell();

    match ty {
        ServerContextType::Pages { .. } | ServerContextType::PagesData { .. } => {
            import_map.insert_exact_alias("next", external);
            import_map.insert_wildcard_alias("next/", external);
            import_map.insert_exact_alias("react", external);
            import_map.insert_wildcard_alias("react/", external);
            import_map.insert_exact_alias("react-dom", external);
            import_map.insert_wildcard_alias("react-dom/", external);
            import_map.insert_exact_alias("styled-jsx", external);
            import_map.insert_wildcard_alias("styled-jsx/", external);
        }
        ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. } => {
            for name in next_config.server_component_externals().await?.iter() {
                import_map.insert_exact_alias(name, external);
                import_map.insert_wildcard_alias(format!("{name}/"), external);
            }
            // The sandbox can't be bundled and needs to be external
            import_map.insert_exact_alias("next/dist/server/web/sandbox", external);
        }
        ServerContextType::Middleware => {}
    }

    Ok(import_map.cell())
}

/// Computes the Next-specific edge-side import map.
#[turbo_tasks::function]
pub async fn get_next_edge_import_map(
    project_path: FileSystemPathVc,
    ty: Value<ServerContextType>,
    next_config: NextConfigVc,
    execution_context: ExecutionContextVc,
) -> Result<ImportMapVc> {
    let mut import_map = ImportMap::empty();

    insert_next_shared_aliases(&mut import_map, project_path, execution_context).await?;

    insert_alias_option(
        &mut import_map,
        project_path,
        next_config.resolve_alias_options(),
        [],
    )
    .await?;

    let ty = ty.into_value();

    insert_next_server_special_aliases(&mut import_map, ty).await?;

    Ok(import_map.cell())
}

pub fn get_next_client_resolved_map(
    context: FileSystemPathVc,
    root: FileSystemPathVc,
) -> ResolvedMapVc {
    let glob_mappings = vec![
        // Temporary hack to replace the hot reloader until this is passable by props in next.js
        (
            context.root(),
            GlobVc::new("**/next/dist/client/components/react-dev-overlay/hot-reloader-client.js"),
            ImportMapping::PrimaryAlternative(
                "@vercel/turbopack-next/dev/hot-reloader.tsx".to_string(),
                Some(root),
            )
            .into(),
        ),
    ];
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

pub async fn insert_next_server_special_aliases(
    import_map: &mut ImportMap,
    ty: ServerContextType,
) -> Result<()> {
    match ty {
        ServerContextType::Pages { pages_dir } => {
            insert_alias_to_alternatives(
                import_map,
                format!("{VIRTUAL_PACKAGE_NAME}/pages/_app"),
                vec![
                    request_to_import_mapping(pages_dir, "./_app"),
                    external_request_to_import_mapping("next/app"),
                ],
            );
            insert_alias_to_alternatives(
                import_map,
                format!("{VIRTUAL_PACKAGE_NAME}/pages/_document"),
                vec![
                    request_to_import_mapping(pages_dir, "./_document"),
                    external_request_to_import_mapping("next/document"),
                ],
            );
            insert_alias_to_alternatives(
                import_map,
                format!("{VIRTUAL_PACKAGE_NAME}/internal/_error"),
                vec![
                    request_to_import_mapping(pages_dir, "./_error"),
                    external_request_to_import_mapping("next/error"),
                ],
            );
        }
        ServerContextType::PagesData { .. } => {}
        ServerContextType::AppSSR { app_dir }
        | ServerContextType::AppRSC { app_dir }
        | ServerContextType::AppRoute { app_dir } => {
            import_map.insert_exact_alias(
                "react",
                request_to_import_mapping(app_dir, "next/dist/compiled/react"),
            );
            import_map.insert_wildcard_alias(
                "react/",
                request_to_import_mapping(app_dir, "next/dist/compiled/react/*"),
            );
            import_map.insert_exact_alias(
                "react-dom",
                request_to_import_mapping(
                    app_dir,
                    "next/dist/compiled/react-dom/server-rendering-stub.js",
                ),
            );
            import_map.insert_wildcard_alias(
                "react-dom/",
                request_to_import_mapping(app_dir, "next/dist/compiled/react-dom/*"),
            );
        }
        ServerContextType::Middleware => {}
    }

    Ok(())
}

pub async fn insert_next_shared_aliases(
    import_map: &mut ImportMap,
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
) -> Result<()> {
    let package_root = next_js_fs().root();

    // we use the next.js hydration code, so we replace the error overlay with our
    // own
    import_map.insert_exact_alias(
        "next/dist/compiled/@next/react-dev-overlay/dist/client",
        request_to_import_mapping(package_root, "./overlay/client.ts"),
    );

    insert_package_alias(
        import_map,
        &format!("{VIRTUAL_PACKAGE_NAME}/"),
        package_root,
    );

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact("next/font/google/target.css"),
        ImportMapping::Dynamic(NextFontGoogleReplacerVc::new(project_path).into()).into(),
    );

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact("@next/font/google/target.css"),
        ImportMapping::Dynamic(NextFontGoogleReplacerVc::new(project_path).into()).into(),
    );

    import_map.insert_alias(
        AliasPattern::exact("@vercel/turbopack-next/internal/font/google/cssmodule.module.css"),
        ImportMapping::Dynamic(
            NextFontGoogleCssModuleReplacerVc::new(project_path, execution_context).into(),
        )
        .into(),
    );

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact("next/font/local/target.css"),
        ImportMapping::Dynamic(NextFontLocalReplacerVc::new(project_path).into()).into(),
    );

    import_map.insert_alias(
        // Request path from js via next-font swc transform
        AliasPattern::exact("@next/font/local/target.css"),
        ImportMapping::Dynamic(NextFontLocalReplacerVc::new(project_path).into()).into(),
    );

    import_map.insert_alias(
        AliasPattern::exact("@vercel/turbopack-next/internal/font/local/cssmodule.module.css"),
        ImportMapping::Dynamic(NextFontLocalCssModuleReplacerVc::new(project_path).into()).into(),
    );

    import_map.insert_singleton_alias("@swc/helpers", get_next_package(project_path));
    import_map.insert_singleton_alias("styled-jsx", get_next_package(project_path));
    import_map.insert_singleton_alias("next", project_path);
    import_map.insert_singleton_alias("react", project_path);
    import_map.insert_singleton_alias("react-dom", project_path);

    insert_package_alias(
        import_map,
        "@vercel/turbopack-dev/",
        turbo_binding::turbopack::dev::embed_js::embed_fs().root(),
    );
    insert_package_alias(
        import_map,
        "@vercel/turbopack-node/",
        turbo_binding::turbopack::node::embed_js::embed_fs().root(),
    );

    Ok(())
}

#[turbo_tasks::function]
async fn package_lookup_resolve_options(
    project_path: FileSystemPathVc,
) -> Result<ResolveOptionsVc> {
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
pub async fn get_next_package(project_path: FileSystemPathVc) -> Result<FileSystemPathVc> {
    let result = resolve(
        project_path,
        RequestVc::parse(Value::new(Pattern::Constant(
            "next/package.json".to_string(),
        ))),
        package_lookup_resolve_options(project_path),
    );
    let assets = result.primary_assets().await?;
    let asset = assets.first().context("Next.js package not found")?;
    Ok(asset.ident().path().parent())
}

pub async fn insert_alias_option<const N: usize>(
    import_map: &mut ImportMap,
    project_path: FileSystemPathVc,
    alias_options: ResolveAliasMapVc,
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
    value: &ExportsValue,
    conditions: &BTreeMap<String, ConditionValue>,
    project_path: FileSystemPathVc,
) -> Option<ImportMappingVc> {
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
            ImportMapping::PrimaryAlternative(result[0].to_string(), Some(project_path)).cell()
        } else {
            ImportMapping::Alternatives(
                result
                    .iter()
                    .map(|m| {
                        ImportMapping::PrimaryAlternative(m.to_string(), Some(project_path)).cell()
                    })
                    .collect(),
            )
            .cell()
        })
    }
}

/// Inserts an alias to an alternative of import mappings into an import map.
fn insert_alias_to_alternatives<'a>(
    import_map: &mut ImportMap,
    alias: impl Into<String> + 'a,
    alternatives: Vec<ImportMappingVc>,
) {
    import_map.insert_exact_alias(alias, ImportMapping::Alternatives(alternatives).into());
}

/// Inserts an alias to an import mapping into an import map.
fn insert_package_alias(import_map: &mut ImportMap, prefix: &str, package_root: FileSystemPathVc) {
    import_map.insert_wildcard_alias(
        prefix,
        ImportMapping::PrimaryAlternative("./*".to_string(), Some(package_root)).cell(),
    );
}

/// Creates a direct import mapping to the result of resolving a request
/// in a context.
fn request_to_import_mapping(context_path: FileSystemPathVc, request: &str) -> ImportMappingVc {
    ImportMapping::PrimaryAlternative(request.to_string(), Some(context_path)).cell()
}

/// Creates a direct import mapping to the result of resolving an external
/// request.
fn external_request_to_import_mapping(request: &str) -> ImportMappingVc {
    ImportMapping::External(Some(request.to_string())).into()
}
