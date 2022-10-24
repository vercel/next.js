use anyhow::Result;
use turbo_tasks::{primitives::StringsVc, Value};
use turbo_tasks_fs::{glob::GlobVc, FileSystemPathVc};
use turbopack_core::resolve::options::{
    ImportMap, ImportMapVc, ImportMapping, ImportMappingVc, ResolvedMap, ResolvedMapVc,
};

use crate::{
    embed_js::{attached_next_js_package_path, VIRTUAL_PACKAGE_NAME},
    next_client::context::ContextType,
    next_server::ServerContextType,
};

/// Computes the Next-specific client import map.
#[turbo_tasks::function]
pub fn get_next_client_import_map(
    project_path: FileSystemPathVc,
    ty: Value<ContextType>,
) -> ImportMapVc {
    let mut import_map = ImportMap::empty();
    let package_root = attached_next_js_package_path(project_path);

    insert_next_shared_aliases(&mut import_map, package_root);

    match ty.into_value() {
        ContextType::Pages { pages_dir } => {
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
        }
        ContextType::App { app_dir } => {
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
        ContextType::Other => {}
    }
    import_map.cell()
}

/// Computes the Next-specific client fallback import map, which provides
/// polyfills to Node.js externals.
#[turbo_tasks::function]
pub fn get_next_client_fallback_import_map(ty: Value<ContextType>) -> ImportMapVc {
    let mut import_map = ImportMap::empty();

    match ty.into_value() {
        ContextType::Pages {
            pages_dir: context_dir,
        }
        | ContextType::App {
            app_dir: context_dir,
        } => {
            for (original, alias) in NEXT_ALIASES {
                import_map
                    .insert_exact_alias(original, request_to_import_mapping(context_dir, alias));
                import_map.insert_exact_alias(
                    format!("node:{original}"),
                    request_to_import_mapping(context_dir, alias),
                );
            }
        }
        ContextType::Other => {}
    }

    import_map.cell()
}

/// Computes the Next-specific server-side import map.
#[turbo_tasks::function]
pub async fn get_next_server_import_map(
    project_path: FileSystemPathVc,
    ty: Value<ServerContextType>,
    externals: StringsVc,
) -> Result<ImportMapVc> {
    let mut import_map = ImportMap::empty();
    let package_root = attached_next_js_package_path(project_path);

    insert_next_shared_aliases(&mut import_map, package_root);

    match ty.into_value() {
        ServerContextType::Pages { pages_dir } => {
            insert_alias_to_alternatives(
                &mut import_map,
                format!("{VIRTUAL_PACKAGE_NAME}/pages/_app"),
                vec![
                    request_to_import_mapping(pages_dir, "./_app"),
                    external_request_to_import_mapping("next/app"),
                ],
            );
            insert_alias_to_alternatives(
                &mut import_map,
                format!("{VIRTUAL_PACKAGE_NAME}/pages/_document"),
                vec![
                    request_to_import_mapping(pages_dir, "./_document"),
                    external_request_to_import_mapping("next/document"),
                ],
            );

            import_map.insert_exact_alias("next", ImportMapping::External(None).into());
            import_map.insert_wildcard_alias("next/", ImportMapping::External(None).into());
            import_map.insert_exact_alias("react", ImportMapping::External(None).into());
            import_map.insert_wildcard_alias("react/", ImportMapping::External(None).into());
            import_map.insert_exact_alias("react-dom", ImportMapping::External(None).into());
            import_map.insert_wildcard_alias("react-dom/", ImportMapping::External(None).into());
        }
        ServerContextType::AppSSR { app_dir } | ServerContextType::AppRSC { app_dir } => {
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

            for external in externals.await?.iter() {
                import_map.insert_exact_alias(external, ImportMapping::External(None).into());
                import_map.insert_wildcard_alias(
                    format!("{external}/"),
                    ImportMapping::External(None).into(),
                );
            }
        }
    }

    Ok(import_map.cell())
}

pub fn get_next_client_resolved_map(
    context: FileSystemPathVc,
    root: FileSystemPathVc,
) -> ResolvedMapVc {
    let glob_mappings = vec![
        // Temporary hack to replace the hot reloader until this is passable by props in next.js
        (
            context,
            GlobVc::new(
                "**/*/next/dist/client/components/react-dev-overlay/hot-reloader-client.js",
            ),
            ImportMapping::PrimaryAlternative(
                "@vercel/turbopack-next/dev/hot-reloader".to_string(),
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
    ("asset", "next/dist/compiled/assert"),
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

pub fn insert_next_shared_aliases(import_map: &mut ImportMap, package_root: FileSystemPathVc) {
    // we use the next.js hydration code, so we replace the error overlay with our
    // own
    import_map.insert_exact_alias(
        "next/dist/compiled/@next/react-dev-overlay/dist/client",
        request_to_import_mapping(package_root, "./overlay/client"),
    );

    insert_package_alias(
        import_map,
        &format!("{VIRTUAL_PACKAGE_NAME}/"),
        package_root,
    );
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
