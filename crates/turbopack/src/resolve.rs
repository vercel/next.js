use anyhow::Result;
use turbo_tasks_fs::{glob::GlobVc, FileSystemPathVc};
use turbopack_core::{
    environment::EnvironmentVc,
    resolve::{
        find_context_file,
        options::{
            ConditionValue, ImportMap, ImportMapping, ResolveIntoPackage, ResolveModules,
            ResolveOptions, ResolveOptionsVc, ResolvedMap,
        },
        FindContextFileResult, PrefixTree,
    },
};
use turbopack_ecmascript::{
    resolve::apply_cjs_specific_options,
    typescript::resolve::{apply_tsconfig, apply_typescript_options},
};

#[turbo_tasks::function]
pub async fn resolve_options(
    context: FileSystemPathVc,
    environment: EnvironmentVc,
) -> Result<ResolveOptionsVc> {
    let parent = context.parent().resolve().await?;
    if parent != context {
        return Ok(resolve_options(parent, environment));
    }
    let context_value = context.await?;
    let emulating = *environment.is_emulating().await?;
    let root = FileSystemPathVc::new(context_value.fs, "");
    let mut direct_mappings = PrefixTree::new();
    for req in [
        "assert",
        "async_hooks",
        "buffer",
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
        "events",
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
        "url",
        "util",
        "util/types",
        "v8",
        "vm",
        "wasi",
        "worker_threads",
        "zlib",
        "pnpapi",
    ] {
        direct_mappings.insert(req, ImportMapping::External(None))?;
        direct_mappings.insert(&format!("node:{req}"), ImportMapping::External(None))?;
    }
    let glob_mappings = vec![
        (
            context,
            GlobVc::new("**/*/next/dist/server/next.js"),
            ImportMapping::Ignore,
        ),
        (
            context,
            GlobVc::new("**/*/next/dist/bin/next"),
            ImportMapping::Ignore,
        ),
    ];
    let import_map = ImportMap {
        direct: direct_mappings,
        by_glob: Vec::new(),
    }
    .into();
    let resolved_map = ResolvedMap {
        by_glob: glob_mappings,
    }
    .into();
    Ok(ResolveOptions {
        extensions: if emulating {
            environment.resolve_extensions().await?.clone()
        } else {
            vec![
                ".tsx".to_string(),
                ".ts".to_string(),
                ".js".to_string(),
                ".jsx".to_string(),
                ".node".to_string(),
                ".json".to_string(),
            ]
        },
        modules: if emulating {
            if *environment.resolve_node_modules().await? {
                vec![ResolveModules::Nested(
                    root,
                    vec!["node_modules".to_string()],
                )]
            } else {
                Vec::new()
            }
        } else {
            vec![ResolveModules::Nested(
                root,
                vec!["node_modules".to_string()],
            )]
        },
        into_package: vec![
            ResolveIntoPackage::ExportsField {
                field: "exports".to_string(),
                conditions: [
                    ("types".to_string(), ConditionValue::Unset),
                    ("react-server".to_string(), ConditionValue::Unset),
                    ("production".to_string(), ConditionValue::Unknown),
                    ("development".to_string(), ConditionValue::Unknown),
                    ("import".to_string(), ConditionValue::Unknown),
                    ("require".to_string(), ConditionValue::Unknown),
                    ("node".to_string(), ConditionValue::Set),
                ]
                .into_iter()
                .collect(),
                unspecified_conditions: ConditionValue::Unset,
            },
            ResolveIntoPackage::MainField("main".to_string()),
            ResolveIntoPackage::Default("index".to_string()),
        ],
        import_map: Some(import_map),
        resolved_map: Some(resolved_map),
        ..Default::default()
    }
    .into())
}

#[turbo_tasks::function]
pub async fn typescript_resolve_options(
    context: FileSystemPathVc,
    environment: EnvironmentVc,
) -> Result<ResolveOptionsVc> {
    let tsconfig = find_context_file(context, "tsconfig.json").await?;
    let base_resolve_options = resolve_options(context, environment);
    let cjs_resolve_options = apply_cjs_specific_options(base_resolve_options);
    let mut options = apply_typescript_options(base_resolve_options);
    match *tsconfig {
        FindContextFileResult::Found(path, _) => {
            options = apply_tsconfig(options, path, cjs_resolve_options);
        }
        FindContextFileResult::NotFound(_) => {}
    }
    Ok(options)
}
