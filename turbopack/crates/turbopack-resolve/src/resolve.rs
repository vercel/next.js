use anyhow::Result;
use next_taskless::{BUN_EXTERNALS, EDGE_NODE_EXTERNALS, NODE_EXTERNALS};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileSystem, FileSystemPath};
use turbopack_core::resolve::{
    AliasMap, AliasPattern, ExternalTraced, ExternalType, FindContextFileResult, find_context_file,
    options::{
        ConditionValue, ImportMap, ImportMapping, ResolutionConditions, ResolveInPackage,
        ResolveIntoPackage, ResolveModules, ResolveOptions,
    },
};

use crate::{
    resolve_options_context::ResolveOptionsContext,
    typescript::{apply_tsconfig_resolve_options, tsconfig, tsconfig_resolve_options},
};

#[turbo_tasks::function]
async fn base_resolve_options(
    fs: ResolvedVc<Box<dyn FileSystem>>,
    options_context: Vc<ResolveOptionsContext>,
) -> Result<Vc<ResolveOptions>> {
    let opt = options_context.await?;
    let emulating = opt.emulate_environment;
    let root = fs.root().owned().await?;
    let mut direct_mappings = AliasMap::new();
    let node_externals = if let Some(environment) = emulating {
        environment.node_externals().owned().await?
    } else {
        opt.enable_node_externals
    };
    let untraced_external_cell =
        ImportMapping::External(None, ExternalType::CommonJs, ExternalTraced::Untraced)
            .resolved_cell();

    for req in BUN_EXTERNALS {
        direct_mappings.insert(AliasPattern::exact(req), untraced_external_cell);
    }

    if node_externals || opt.enable_edge_node_externals {
        if node_externals {
            for req in NODE_EXTERNALS {
                direct_mappings.insert(AliasPattern::exact(req), untraced_external_cell);
                direct_mappings.insert(
                    AliasPattern::exact(format!("node:{req}")),
                    untraced_external_cell,
                );
            }
        }

        if opt.enable_edge_node_externals {
            for req in EDGE_NODE_EXTERNALS {
                direct_mappings.insert(
                    AliasPattern::exact(req),
                    ImportMapping::External(
                        Some(format!("node:{req}").into()),
                        ExternalType::CommonJs,
                        ExternalTraced::Untraced,
                    )
                    .resolved_cell(),
                );
                direct_mappings.insert(
                    AliasPattern::exact(format!("node:{req}")),
                    untraced_external_cell,
                );
            }
        }
    }

    let mut import_map = ImportMap::new(direct_mappings);
    if let Some(additional_import_map) = opt.import_map {
        let additional_import_map = additional_import_map.await?;
        import_map.extend_ref(&additional_import_map);
    }
    let import_map = import_map.resolved_cell();

    let conditions = {
        let mut conditions: ResolutionConditions = [
            (rcstr!("import"), ConditionValue::Unknown),
            (rcstr!("require"), ConditionValue::Unknown),
        ]
        .into_iter()
        .collect();
        if opt.browser {
            conditions.insert(rcstr!("browser"), ConditionValue::Set);
        }
        if opt.module {
            conditions.insert(rcstr!("module"), ConditionValue::Set);
        }
        if let Some(environment) = emulating {
            for condition in environment.resolve_conditions().await?.iter() {
                conditions.insert(condition.clone(), ConditionValue::Set);
            }
        }
        for condition in opt.custom_conditions.iter() {
            conditions.insert(condition.clone(), ConditionValue::Set);
        }
        // Infer some well-known conditions
        let dev = conditions.get("development").cloned();
        let prod = conditions.get("production").cloned();
        if prod.is_none() {
            conditions.insert(
                rcstr!("production"),
                if matches!(dev, Some(ConditionValue::Set)) {
                    ConditionValue::Unset
                } else {
                    ConditionValue::Unknown
                },
            );
        }
        if dev.is_none() {
            conditions.insert(
                rcstr!("development"),
                if matches!(prod, Some(ConditionValue::Set)) {
                    ConditionValue::Unset
                } else {
                    ConditionValue::Unknown
                },
            );
        }
        conditions
    };

    let extensions = if let Some(custom_extension) = &opt.custom_extensions {
        custom_extension.clone()
    } else if let Some(environment) = emulating {
        environment.resolve_extensions().owned().await?
    } else {
        let mut ext = Vec::new();
        if opt.enable_typescript && opt.enable_react {
            ext.push(rcstr!(".tsx"));
        }
        if opt.enable_typescript {
            ext.push(rcstr!(".ts"));
        }
        if opt.enable_react {
            ext.push(rcstr!(".jsx"));
        }
        ext.push(rcstr!(".js"));
        if opt.enable_mjs_extension {
            ext.push(rcstr!(".mjs"));
        }
        if opt.enable_node_native_modules {
            ext.push(rcstr!(".node"));
        }
        ext.push(rcstr!(".json"));
        ext
    };
    Ok(ResolveOptions {
        extensions,
        modules: if let Some(environment) = emulating {
            if *environment.resolve_node_modules().await? {
                vec![ResolveModules::Nested(
                    root.clone(),
                    vec![rcstr!("node_modules")],
                )]
            } else {
                Vec::new()
            }
        } else {
            let mut mods = Vec::new();
            if let Some(dir) = &opt.enable_node_modules {
                mods.push(ResolveModules::Nested(
                    dir.clone(),
                    vec![rcstr!("node_modules")],
                ));
            }
            mods
        },
        into_package: {
            let mut resolve_into = vec![ResolveIntoPackage::ExportsField {
                conditions: conditions.clone(),
                unspecified_conditions: ConditionValue::Unset,
            }];
            if opt.browser {
                resolve_into.push(ResolveIntoPackage::MainField {
                    field: rcstr!("browser"),
                });
            }
            if opt.module {
                resolve_into.push(ResolveIntoPackage::MainField {
                    field: rcstr!("module"),
                });
            }
            resolve_into.push(ResolveIntoPackage::MainField {
                field: rcstr!("main"),
            });
            resolve_into
        },
        in_package: {
            let mut resolve_in = vec![ResolveInPackage::ImportsField {
                conditions,
                unspecified_conditions: ConditionValue::Unset,
            }];
            if opt.browser {
                resolve_in.push(ResolveInPackage::AliasField(rcstr!("browser")));
            }
            resolve_in
        },
        default_files: vec![rcstr!("index")],
        import_map: Some(import_map),
        resolved_map: opt.resolved_map,
        after_resolve_plugins: opt.after_resolve_plugins.clone(),
        before_resolve_plugins: opt.before_resolve_plugins.clone(),
        loose_errors: opt.loose_errors,
        collect_affecting_sources: opt.collect_affecting_sources,
        ..Default::default()
    }
    .into())
}

#[turbo_tasks::function]
pub async fn resolve_options(
    resolve_path: FileSystemPath,
    options_context: Vc<ResolveOptionsContext>,
) -> Result<Vc<ResolveOptions>> {
    let options_context_value = options_context.await?;
    if !options_context_value.rules.is_empty() {
        for (condition, new_options_context) in options_context_value.rules.iter() {
            if condition.matches(&resolve_path) {
                return Ok(resolve_options(resolve_path, **new_options_context));
            }
        }
    }

    let resolve_options = base_resolve_options(*resolve_path.fs, options_context);

    let resolve_options = if options_context_value.enable_typescript {
        let find_tsconfig = async || {
            // Otherwise, attempt to find a tsconfig up the file tree
            let tsconfig = find_context_file(
                resolve_path.clone(),
                tsconfig(),
                options_context_value.collect_affecting_sources,
            )
            .await?;
            anyhow::Ok::<Vc<ResolveOptions>>(match &*tsconfig {
                FindContextFileResult::Found(path, _) => apply_tsconfig_resolve_options(
                    resolve_options,
                    tsconfig_resolve_options(path.clone()),
                ),
                FindContextFileResult::NotFound(_) => resolve_options,
            })
        };

        // Use a specified tsconfig path if provided. In Next.js, this is always provided by the
        // default config, at the very least.
        if let Some(tsconfig_path) = &options_context_value.tsconfig_path {
            let meta = tsconfig_path.metadata().await;
            if meta.is_ok() {
                // If the file exists, use it.
                apply_tsconfig_resolve_options(
                    resolve_options,
                    tsconfig_resolve_options(tsconfig_path.clone()),
                )
            } else {
                // Otherwise, try and find one.
                // TODO: If the user provides a tsconfig.json explicitly, this should fail
                // explicitly. Currently implemented this way for parity with webpack.
                find_tsconfig().await?
            }
        } else {
            find_tsconfig().await?
        }
    } else {
        resolve_options
    };

    // Make sure to always apply `options_context.import_map` last, so it properly
    // overwrites any other mappings.
    let resolve_options = options_context_value
        .import_map
        .map(|import_map| resolve_options.with_extended_import_map(*import_map))
        .unwrap_or(resolve_options);
    // And the same for the fallback_import_map
    let resolve_options = options_context_value
        .fallback_import_map
        .map(|fallback_import_map| {
            resolve_options.with_extended_fallback_import_map(*fallback_import_map)
        })
        .unwrap_or(resolve_options);

    Ok(resolve_options)
}
