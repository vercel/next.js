use std::collections::BTreeMap;

use anyhow::Result;
use turbo_tasks_fs::{glob::GlobVc, FileSystemPathVc};
use turbopack_core::resolve::{
    find_context_file,
    options::{
        ConditionValue, ImportMap, ImportMapping, ResolveIntoPackage, ResolveModules,
        ResolveOptions, ResolveOptionsVc, ResolvedMap,
    },
    FindContextFileResult, PrefixTree,
};
use turbopack_ecmascript::{
    resolve::apply_cjs_specific_options, typescript::resolve::apply_tsconfig,
};

use crate::resolve_options_context::ResolveOptionsContextVc;

#[turbo_tasks::function]
async fn raw_resolve_options(
    context: FileSystemPathVc,
    options_context: ResolveOptionsContextVc,
) -> Result<ResolveOptionsVc> {
    let parent = context.parent().resolve().await?;
    if parent != context {
        return Ok(resolve_options(parent, options_context));
    }
    let context_value = context.await?;
    let opt = options_context.await?;
    let emulating = opt.emulate_environment;
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
        extensions: if let Some(environment) = emulating {
            environment.resolve_extensions().await?.clone_value()
        } else {
            let mut ext = Vec::new();
            if opt.enable_typescript && opt.enable_react {
                ext.push(".tsx".to_string());
            }
            if opt.enable_typescript {
                ext.push(".ts".to_string());
            }
            if opt.enable_react {
                ext.push(".jsx".to_string());
            }
            ext.push(".js".to_string());
            if opt.enable_node_native_modules {
                ext.push(".node".to_string());
            }
            ext.push(".json".to_string());
            ext
        },
        modules: if let Some(environment) = emulating {
            if *environment.resolve_node_modules().await? {
                vec![ResolveModules::Nested(
                    root,
                    vec!["node_modules".to_string()],
                )]
            } else {
                Vec::new()
            }
        } else {
            let mut mods = Vec::new();
            if opt.enable_node_modules {
                mods.push(ResolveModules::Nested(
                    root,
                    vec!["node_modules".to_string()],
                ));
            }
            mods
        },
        into_package: vec![
            ResolveIntoPackage::ExportsField {
                field: "exports".to_string(),
                conditions: {
                    let mut conditions: BTreeMap<String, ConditionValue> = [
                        ("import".to_string(), ConditionValue::Unknown),
                        ("require".to_string(), ConditionValue::Unknown),
                    ]
                    .into_iter()
                    .collect();
                    if let Some(environment) = emulating {
                        for condition in environment.resolve_conditions().await?.iter() {
                            conditions.insert(condition.to_string(), ConditionValue::Set);
                        }
                    }
                    for condition in opt.custom_conditions.iter() {
                        conditions.insert(condition.to_string(), ConditionValue::Set);
                    }
                    // Infer some well known conditions
                    let dev = conditions.get("development").cloned();
                    let prod = conditions.get("production").cloned();
                    if prod.is_none() {
                        conditions.insert(
                            "production".to_string(),
                            if matches!(dev, Some(ConditionValue::Set)) {
                                ConditionValue::Unset
                            } else {
                                ConditionValue::Unknown
                            },
                        );
                    }
                    if dev.is_none() {
                        conditions.insert(
                            "development".to_string(),
                            if matches!(prod, Some(ConditionValue::Set)) {
                                ConditionValue::Unset
                            } else {
                                ConditionValue::Unknown
                            },
                        );
                    }
                    conditions
                },
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
pub async fn resolve_options(
    context: FileSystemPathVc,
    options_context: ResolveOptionsContextVc,
) -> Result<ResolveOptionsVc> {
    let base_resolve_options = raw_resolve_options(context, options_context);
    if options_context.await?.enable_typescript {
        let tsconfig = find_context_file(context, "tsconfig.json").await?;
        let cjs_resolve_options = apply_cjs_specific_options(base_resolve_options);
        let mut options = base_resolve_options;
        match *tsconfig {
            FindContextFileResult::Found(path, _) => {
                options = apply_tsconfig(options, path, cjs_resolve_options);
            }
            FindContextFileResult::NotFound(_) => {}
        }
        Ok(options)
    } else {
        Ok(base_resolve_options)
    }
}
