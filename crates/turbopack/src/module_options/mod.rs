pub(crate) mod custom_module_type;
pub mod module_options_context;
pub mod module_rule;
pub mod rule_condition;

use anyhow::{Context, Result};
pub use custom_module_type::CustomModuleType;
pub use module_options_context::*;
pub use module_rule::*;
pub use rule_condition::*;
use turbo_tasks::{RcStr, Vc};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};
use turbopack_core::{
    reference_type::{CssReferenceSubType, ReferenceType, UrlReferenceSubType},
    resolve::options::{ImportMap, ImportMapping},
};
use turbopack_css::CssModuleAssetType;
use turbopack_ecmascript::{EcmascriptInputTransform, EcmascriptOptions, SpecifiedModuleType};
use turbopack_node::transforms::{postcss::PostCssTransform, webpack::WebpackLoaders};
use turbopack_wasm::source::WebAssemblySourceType;

use crate::{
    evaluate_context::node_evaluate_asset_context, resolve_options_context::ResolveOptionsContext,
};

#[turbo_tasks::function]
async fn package_import_map_from_import_mapping(
    package_name: RcStr,
    package_mapping: Vc<ImportMapping>,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::default();
    import_map.insert_exact_alias(
        format!("@vercel/turbopack/{}", package_name),
        package_mapping,
    );
    Ok(import_map.cell())
}

#[turbo_tasks::function]
async fn package_import_map_from_context(
    package_name: RcStr,
    context_path: Vc<FileSystemPath>,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::default();
    import_map.insert_exact_alias(
        format!("@vercel/turbopack/{}", package_name),
        ImportMapping::PrimaryAlternative(package_name, Some(context_path)).cell(),
    );
    Ok(import_map.cell())
}

#[turbo_tasks::value(cell = "new", eq = "manual")]
pub struct ModuleOptions {
    pub rules: Vec<ModuleRule>,
}

#[turbo_tasks::value_impl]
impl ModuleOptions {
    #[turbo_tasks::function]
    pub async fn new(
        path: Vc<FileSystemPath>,
        module_options_context: Vc<ModuleOptionsContext>,
        resolve_options_context: Vc<ResolveOptionsContext>,
    ) -> Result<Vc<ModuleOptions>> {
        let ModuleOptionsContext {
            enable_jsx,
            enable_types,
            tree_shaking_mode,
            ref enable_typescript_transform,
            ref decorators,
            enable_mdx,
            enable_mdx_rs,
            enable_raw_css,
            ref enable_postcss_transform,
            ref enable_webpack_loaders,
            preset_env_versions,
            ref custom_rules,
            execution_context,
            ref rules,
            esm_url_rewrite_behavior,
            special_exports,
            import_externals,
            ignore_dynamic_requests,
            use_swc_css,
            ref enable_typeof_window_inlining,
            ..
        } = *module_options_context.await?;
        let special_exports = special_exports.unwrap_or_default();

        if !rules.is_empty() {
            let path_value = path.await?;

            for (condition, new_context) in rules.iter() {
                if condition.matches(&path_value).await? {
                    return Ok(ModuleOptions::new(
                        path,
                        *new_context,
                        resolve_options_context,
                    ));
                }
            }
        }

        let mut refresh = false;
        let mut transforms = vec![];

        // Order of transforms is important. e.g. if the React transform occurs before
        // Styled JSX, there won't be JSX nodes for Styled JSX to transform.
        // If a custom plugin requires specific order _before_ core transform kicks in,
        // should use `before_transform_plugins`.
        if let Some(enable_jsx) = enable_jsx {
            let jsx = enable_jsx.await?;
            refresh = jsx.react_refresh;

            transforms.push(EcmascriptInputTransform::React {
                development: jsx.development,
                refresh: jsx.react_refresh,
                import_source: Vc::cell(jsx.import_source.clone()),
                runtime: Vc::cell(jsx.runtime.clone()),
            });
        }

        let ecmascript_options = EcmascriptOptions {
            tree_shaking_mode,
            url_rewrite_behavior: esm_url_rewrite_behavior,
            import_externals,
            special_exports,
            ignore_dynamic_requests,
            refresh,
            ..Default::default()
        };
        let ecmascript_options_vc = ecmascript_options.cell();

        if let Some(env) = preset_env_versions {
            transforms.push(EcmascriptInputTransform::PresetEnv(env));
        }

        if let Some(enable_typeof_window_inlining) = enable_typeof_window_inlining {
            transforms.push(EcmascriptInputTransform::GlobalTypeofs {
                window_value: match enable_typeof_window_inlining {
                    TypeofWindow::Object => "object".to_string(),
                    TypeofWindow::Undefined => "undefined".to_string(),
                },
            });
        }

        let ts_transform = if let Some(options) = enable_typescript_transform {
            let options = options.await?;
            Some(EcmascriptInputTransform::TypeScript {
                use_define_for_class_fields: options.use_define_for_class_fields,
            })
        } else {
            None
        };

        let decorators_transform = if let Some(options) = &decorators {
            let options = options.await?;
            options
                .decorators_kind
                .as_ref()
                .map(|kind| EcmascriptInputTransform::Decorators {
                    is_legacy: kind == &DecoratorsKind::Legacy,
                    is_ecma: kind == &DecoratorsKind::Ecma,
                    emit_decorators_metadata: options.emit_decorators_metadata,
                    use_define_for_class_fields: options.use_define_for_class_fields,
                })
        } else {
            None
        };

        let vendor_transforms = Vc::cell(vec![]);
        let ts_app_transforms = if let Some(transform) = &ts_transform {
            let base_transforms = if let Some(decorators_transform) = &decorators_transform {
                vec![decorators_transform.clone(), transform.clone()]
            } else {
                vec![transform.clone()]
            };
            Vc::cell(
                base_transforms
                    .iter()
                    .cloned()
                    .chain(transforms.iter().cloned())
                    .collect(),
            )
        } else {
            Vc::cell(transforms.clone())
        };

        let mdx_transforms = Vc::cell(
            if let Some(transform) = &ts_transform {
                if let Some(decorators_transform) = &decorators_transform {
                    vec![decorators_transform.clone(), transform.clone()]
                } else {
                    vec![transform.clone()]
                }
            } else {
                vec![]
            }
            .iter()
            .cloned()
            .chain(transforms.iter().cloned())
            .collect(),
        );

        // Apply decorators transform for the ModuleType::Ecmascript as well after
        // constructing ts_app_transforms. Ecmascript can have decorators for
        // the cases of 1. using jsconfig, to enable ts-specific runtime
        // decorators (i.e legacy) 2. ecma spec decorators
        //
        // Since typescript transform (`ts_app_transforms`) needs to apply decorators
        // _before_ stripping types, we create ts_app_transforms first in a
        // specific order with typescript, then apply decorators to app_transforms.
        let app_transforms = Vc::cell(
            if let Some(decorators_transform) = &decorators_transform {
                vec![decorators_transform.clone()]
            } else {
                vec![]
            }
            .iter()
            .cloned()
            .chain(transforms.iter().cloned())
            .collect(),
        );

        let mut rules = vec![
            ModuleRule::new_all(
                ModuleRuleCondition::ResourcePathEndsWith(".json".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Json)],
            ),
            ModuleRule::new_all(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".jsx".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: app_transforms,
                    options: ecmascript_options_vc,
                })],
            ),
            ModuleRule::new_all(
                ModuleRuleCondition::ResourcePathEndsWith(".mjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: app_transforms,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::EcmaScript,
                        ..ecmascript_options
                    }
                    .into(),
                })],
            ),
            ModuleRule::new_all(
                ModuleRuleCondition::ResourcePathEndsWith(".cjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: app_transforms,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::CommonJs,
                        ..ecmascript_options
                    }
                    .into(),
                })],
            ),
            ModuleRule::new_all(
                ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms,
                    tsx: false,
                    analyze_types: enable_types,
                    options: ecmascript_options_vc,
                })],
            ),
            ModuleRule::new_all(
                ModuleRuleCondition::ResourcePathEndsWith(".tsx".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms,
                    tsx: true,
                    analyze_types: enable_types,
                    options: ecmascript_options_vc,
                })],
            ),
            ModuleRule::new_all(
                ModuleRuleCondition::ResourcePathEndsWith(".mts".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms,
                    tsx: false,
                    analyze_types: enable_types,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::EcmaScript,
                        ..ecmascript_options
                    }
                    .into(),
                })],
            ),
            ModuleRule::new_all(
                ModuleRuleCondition::ResourcePathEndsWith(".mtsx".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms,
                    tsx: true,
                    analyze_types: enable_types,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::EcmaScript,
                        ..ecmascript_options
                    }
                    .into(),
                })],
            ),
            ModuleRule::new_all(
                ModuleRuleCondition::ResourcePathEndsWith(".cts".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms,
                    tsx: false,
                    analyze_types: enable_types,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::CommonJs,
                        ..ecmascript_options
                    }
                    .into(),
                })],
            ),
            ModuleRule::new_all(
                ModuleRuleCondition::ResourcePathEndsWith(".ctsx".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms,
                    tsx: true,
                    analyze_types: enable_types,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::CommonJs,
                        ..ecmascript_options
                    }
                    .into(),
                })],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".d.ts".to_string()),
                vec![ModuleRuleEffect::ModuleType(
                    ModuleType::TypescriptDeclaration {
                        transforms: vendor_transforms,
                        options: ecmascript_options_vc,
                    },
                )],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".apng".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".avif".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".gif".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".ico".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".jpg".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".jpeg".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".png".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".svg".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".webp".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".woff2".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Static)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![ModuleRuleCondition::ResourcePathEndsWith(
                    ".node".to_string(),
                )]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Raw)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![ModuleRuleCondition::ResourcePathEndsWith(
                    ".wasm".to_string(),
                )]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::WebAssembly {
                    source_ty: WebAssemblySourceType::Binary,
                })],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![ModuleRuleCondition::ResourcePathEndsWith(
                    ".wat".to_string(),
                )]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::WebAssembly {
                    source_ty: WebAssemblySourceType::Text,
                })],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathHasNoExtension,
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: vendor_transforms,
                    options: ecmascript_options_vc,
                })],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ReferenceType(ReferenceType::Url(
                    UrlReferenceSubType::Undefined,
                )),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Static)],
            ),
        ];

        if enable_raw_css {
            rules.extend([
                ModuleRule::new(
                    ModuleRuleCondition::all(vec![ModuleRuleCondition::ResourcePathEndsWith(
                        ".css".to_string(),
                    )]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Default,
                        use_swc_css,
                    })],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::all(vec![ModuleRuleCondition::ResourcePathEndsWith(
                        ".module.css".to_string(),
                    )]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
                        use_swc_css,
                    })],
                ),
            ]);
        } else {
            if let Some(options) = enable_postcss_transform {
                let options = options.await?;
                let execution_context = execution_context
                    .context("execution_context is required for the postcss_transform")?;

                let import_map = if let Some(postcss_package) = options.postcss_package {
                    package_import_map_from_import_mapping("postcss".into(), postcss_package)
                } else {
                    package_import_map_from_context("postcss".into(), path)
                };

                rules.push(ModuleRule::new(
                    ModuleRuleCondition::ResourcePathEndsWith(".css".to_string()),
                    vec![ModuleRuleEffect::SourceTransforms(Vc::cell(vec![
                        Vc::upcast(PostCssTransform::new(
                            node_evaluate_asset_context(
                                execution_context,
                                Some(import_map),
                                None,
                                "postcss".into(),
                            ),
                            execution_context,
                            options.config_location,
                        )),
                    ]))],
                ));
            }

            rules.extend([
                ModuleRule::new(
                    ModuleRuleCondition::all(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".css".to_string()),
                        // Only create a global CSS asset if not `@import`ed from CSS already.
                        ModuleRuleCondition::not(ModuleRuleCondition::ReferenceType(
                            ReferenceType::Css(CssReferenceSubType::AtImport(None)),
                        )),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::CssGlobal)],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::all(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".module.css".to_string()),
                        // Only create a module CSS asset if not `@import`ed from CSS already.
                        // NOTE: `composes` references should not be treated as `@import`s and
                        // should also create a module CSS asset.
                        ModuleRuleCondition::not(ModuleRuleCondition::ReferenceType(
                            ReferenceType::Css(CssReferenceSubType::AtImport(None)),
                        )),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::CssModule)],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::all(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".css".to_string()),
                        // Create a normal CSS asset if `@import`ed from CSS already.
                        ModuleRuleCondition::ReferenceType(ReferenceType::Css(
                            CssReferenceSubType::AtImport(None),
                        )),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Default,
                        use_swc_css,
                    })],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::all(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".module.css".to_string()),
                        // Create a normal CSS asset if `@import`ed from CSS already.
                        ModuleRuleCondition::ReferenceType(ReferenceType::Css(
                            CssReferenceSubType::AtImport(None),
                        )),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
                        use_swc_css,
                    })],
                ),
                ModuleRule::new_internal(
                    ModuleRuleCondition::ResourcePathEndsWith(".css".to_string()),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Default,
                        use_swc_css,
                    })],
                ),
                ModuleRule::new_internal(
                    ModuleRuleCondition::ResourcePathEndsWith(".module.css".to_string()),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
                        use_swc_css,
                    })],
                ),
            ]);
        }

        if enable_mdx || enable_mdx_rs.is_some() {
            let (jsx_runtime, jsx_import_source, development) = if let Some(enable_jsx) = enable_jsx
            {
                let jsx = enable_jsx.await?;
                (
                    jsx.runtime.clone(),
                    jsx.import_source.clone(),
                    jsx.development,
                )
            } else {
                (None, None, false)
            };

            let mdx_options = &*enable_mdx_rs.unwrap_or(Default::default()).await?;

            let mdx_transform_options = (MdxTransformOptions {
                development: Some(development),
                jsx: Some(false),
                jsx_runtime,
                jsx_import_source,
                ..(mdx_options.clone())
            })
            .cell();

            rules.push(ModuleRule::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".md".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".mdx".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Mdx {
                    transforms: mdx_transforms,
                    options: mdx_transform_options,
                    ecmascript_options: ecmascript_options_vc,
                })],
            ));
        }

        if let Some(webpack_loaders_options) = enable_webpack_loaders {
            let webpack_loaders_options = webpack_loaders_options.await?;
            let execution_context =
                execution_context.context("execution_context is required for webpack_loaders")?;
            let import_map = if let Some(loader_runner_package) =
                webpack_loaders_options.loader_runner_package
            {
                package_import_map_from_import_mapping(
                    "loader-runner".into(),
                    loader_runner_package,
                )
            } else {
                package_import_map_from_context("loader-runner".into(), path)
            };
            for (glob, rule) in webpack_loaders_options.rules.await?.iter() {
                rules.push(ModuleRule::new(
                    ModuleRuleCondition::All(vec![
                        if !glob.contains('/') {
                            ModuleRuleCondition::ResourceBasePathGlob(
                                Glob::new(glob.clone()).await?,
                            )
                        } else {
                            ModuleRuleCondition::ResourcePathGlob {
                                base: execution_context.project_path().await?,
                                glob: Glob::new(glob.clone()).await?,
                            }
                        },
                        ModuleRuleCondition::not(ModuleRuleCondition::ResourceIsVirtualSource),
                    ]),
                    vec![
                        // By default, loaders are expected to return ecmascript code.
                        // This can be overriden by specifying e. g. `as: "*.css"` in the rule.
                        ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                            transforms: app_transforms,
                            options: ecmascript_options_vc,
                        }),
                        ModuleRuleEffect::SourceTransforms(Vc::cell(vec![Vc::upcast(
                            WebpackLoaders::new(
                                node_evaluate_asset_context(
                                    execution_context,
                                    Some(import_map),
                                    None,
                                    "webpack_loaders".into(),
                                ),
                                execution_context,
                                rule.loaders,
                                rule.rename_as.clone(),
                                resolve_options_context,
                            ),
                        )])),
                    ],
                ));
            }
        }

        rules.extend(custom_rules.iter().cloned());

        Ok(ModuleOptions::cell(ModuleOptions { rules }))
    }
}
