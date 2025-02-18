pub(crate) mod custom_module_type;
pub mod match_mode;
pub mod module_options_context;
pub mod module_rule;
pub mod rule_condition;
pub mod transition_rule;

use anyhow::{Context, Result};
pub use custom_module_type::CustomModuleType;
pub use module_options_context::*;
pub use module_rule::*;
pub use rule_condition::*;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};
use turbopack_core::{
    chunk::SourceMapsType,
    reference_type::{CssReferenceSubType, ReferenceType, UrlReferenceSubType},
    resolve::options::{ImportMap, ImportMapping},
};
use turbopack_css::CssModuleAssetType;
use turbopack_ecmascript::{
    EcmascriptInputTransform, EcmascriptInputTransforms, EcmascriptOptions, SpecifiedModuleType,
};
use turbopack_mdx::MdxTransform;
use turbopack_node::transforms::{postcss::PostCssTransform, webpack::WebpackLoaders};
use turbopack_wasm::source::WebAssemblySourceType;

use crate::{
    evaluate_context::node_evaluate_asset_context, resolve_options_context::ResolveOptionsContext,
};

#[turbo_tasks::function]
async fn package_import_map_from_import_mapping(
    package_name: RcStr,
    package_mapping: ResolvedVc<ImportMapping>,
) -> Vc<ImportMap> {
    let mut import_map = ImportMap::default();
    import_map.insert_exact_alias(
        format!("@vercel/turbopack/{}", package_name),
        package_mapping,
    );
    import_map.cell()
}

#[turbo_tasks::function]
async fn package_import_map_from_context(
    package_name: RcStr,
    context_path: ResolvedVc<FileSystemPath>,
) -> Vc<ImportMap> {
    let mut import_map = ImportMap::default();
    import_map.insert_exact_alias(
        format!("@vercel/turbopack/{}", package_name),
        ImportMapping::PrimaryAlternative(package_name, Some(context_path)).resolved_cell(),
    );
    import_map.cell()
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
            css: CssOptionsContext { enable_raw_css, .. },
            ref enable_postcss_transform,
            ref enable_webpack_loaders,
            ref rules,
            ..
        } = *module_options_context.await?;

        if !rules.is_empty() {
            let path_value = path.await?;

            for (condition, new_context) in rules.iter() {
                if condition.matches(&path_value).await? {
                    return Ok(ModuleOptions::new(
                        path,
                        **new_context,
                        resolve_options_context,
                    ));
                }
            }
        }

        let need_path = (!enable_raw_css
            && if let Some(options) = enable_postcss_transform {
                let options = options.await?;
                options.postcss_package.is_none()
            } else {
                false
            })
            || if let Some(options) = enable_webpack_loaders {
                let options = options.await?;
                options.loader_runner_package.is_none()
            } else {
                false
            };

        Ok(Self::new_internal(
            need_path.then_some(path),
            module_options_context,
            resolve_options_context,
        ))
    }

    #[turbo_tasks::function]
    async fn new_internal(
        path: Option<Vc<FileSystemPath>>,
        module_options_context: Vc<ModuleOptionsContext>,
        resolve_options_context: Vc<ResolveOptionsContext>,
    ) -> Result<Vc<ModuleOptions>> {
        let ModuleOptionsContext {
            ecmascript:
                EcmascriptOptionsContext {
                    enable_jsx,
                    enable_types,
                    ref enable_typescript_transform,
                    ref enable_decorators,
                    ignore_dynamic_requests,
                    import_externals,
                    esm_url_rewrite_behavior,
                    ref enable_typeof_window_inlining,
                    source_maps: ecmascript_source_maps,
                    ..
                },
            enable_mdx,
            enable_mdx_rs,
            css:
                CssOptionsContext {
                    enable_raw_css,
                    source_maps: css_source_maps,
                    ..
                },
            ref enable_postcss_transform,
            ref enable_webpack_loaders,
            preset_env_versions,
            ref module_rules,
            execution_context,
            tree_shaking_mode,
            keep_last_successful_parse,
            ..
        } = *module_options_context.await?;

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
                import_source: ResolvedVc::cell(jsx.import_source.clone()),
                runtime: ResolvedVc::cell(jsx.runtime.clone()),
            });
        }

        let ecmascript_options = EcmascriptOptions {
            tree_shaking_mode,
            url_rewrite_behavior: esm_url_rewrite_behavior,
            import_externals,
            ignore_dynamic_requests,
            refresh,
            extract_source_map: matches!(ecmascript_source_maps, SourceMapsType::Full),
            keep_last_successful_parse,
            ..Default::default()
        };
        let ecmascript_options_vc = ecmascript_options.resolved_cell();

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

        let decorators_transform = if let Some(options) = &enable_decorators {
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

        let vendor_transforms = Vc::<EcmascriptInputTransforms>::cell(vec![]);
        let ts_app_transforms = if let Some(transform) = &ts_transform {
            let base_transforms = if let Some(decorators_transform) = &decorators_transform {
                vec![decorators_transform.clone(), transform.clone()]
            } else {
                vec![transform.clone()]
            };
            Vc::<EcmascriptInputTransforms>::cell(
                base_transforms
                    .iter()
                    .cloned()
                    .chain(transforms.iter().cloned())
                    .collect(),
            )
        } else {
            Vc::cell(transforms.clone())
        };

        // Apply decorators transform for the ModuleType::Ecmascript as well after
        // constructing ts_app_transforms. Ecmascript can have decorators for
        // the cases of 1. using jsconfig, to enable ts-specific runtime
        // decorators (i.e legacy) 2. ecma spec decorators
        //
        // Since typescript transform (`ts_app_transforms`) needs to apply decorators
        // _before_ stripping types, we create ts_app_transforms first in a
        // specific order with typescript, then apply decorators to app_transforms.
        let app_transforms = Vc::<EcmascriptInputTransforms>::cell(
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
                RuleCondition::ResourcePathEndsWith(".json".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Json)],
            ),
            ModuleRule::new_all(
                RuleCondition::any(vec![
                    RuleCondition::ResourcePathEndsWith(".js".to_string()),
                    RuleCondition::ResourcePathEndsWith(".jsx".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: app_transforms.to_resolved().await?,
                    options: ecmascript_options_vc,
                })],
            ),
            ModuleRule::new_all(
                RuleCondition::ResourcePathEndsWith(".mjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: app_transforms.to_resolved().await?,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::EcmaScript,
                        ..ecmascript_options
                    }
                    .resolved_cell(),
                })],
            ),
            ModuleRule::new_all(
                RuleCondition::ResourcePathEndsWith(".cjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: app_transforms.to_resolved().await?,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::CommonJs,
                        ..ecmascript_options
                    }
                    .resolved_cell(),
                })],
            ),
            ModuleRule::new_all(
                RuleCondition::ResourcePathEndsWith(".ts".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms.to_resolved().await?,
                    tsx: false,
                    analyze_types: enable_types,
                    options: ecmascript_options_vc,
                })],
            ),
            ModuleRule::new_all(
                RuleCondition::ResourcePathEndsWith(".tsx".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms.to_resolved().await?,
                    tsx: true,
                    analyze_types: enable_types,
                    options: ecmascript_options_vc,
                })],
            ),
            ModuleRule::new_all(
                RuleCondition::ResourcePathEndsWith(".mts".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms.to_resolved().await?,
                    tsx: false,
                    analyze_types: enable_types,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::EcmaScript,
                        ..ecmascript_options
                    }
                    .resolved_cell(),
                })],
            ),
            ModuleRule::new_all(
                RuleCondition::ResourcePathEndsWith(".mtsx".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms.to_resolved().await?,
                    tsx: true,
                    analyze_types: enable_types,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::EcmaScript,
                        ..ecmascript_options
                    }
                    .resolved_cell(),
                })],
            ),
            ModuleRule::new_all(
                RuleCondition::ResourcePathEndsWith(".cts".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms.to_resolved().await?,
                    tsx: false,
                    analyze_types: enable_types,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::CommonJs,
                        ..ecmascript_options
                    }
                    .resolved_cell(),
                })],
            ),
            ModuleRule::new_all(
                RuleCondition::ResourcePathEndsWith(".ctsx".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                    transforms: ts_app_transforms.to_resolved().await?,
                    tsx: true,
                    analyze_types: enable_types,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::CommonJs,
                        ..ecmascript_options
                    }
                    .resolved_cell(),
                })],
            ),
            ModuleRule::new(
                RuleCondition::ResourcePathEndsWith(".d.ts".to_string()),
                vec![ModuleRuleEffect::ModuleType(
                    ModuleType::TypescriptDeclaration {
                        transforms: vendor_transforms.to_resolved().await?,
                        options: ecmascript_options_vc,
                    },
                )],
            ),
            ModuleRule::new(
                RuleCondition::any(vec![
                    RuleCondition::ResourcePathEndsWith(".apng".to_string()),
                    RuleCondition::ResourcePathEndsWith(".avif".to_string()),
                    RuleCondition::ResourcePathEndsWith(".gif".to_string()),
                    RuleCondition::ResourcePathEndsWith(".ico".to_string()),
                    RuleCondition::ResourcePathEndsWith(".jpg".to_string()),
                    RuleCondition::ResourcePathEndsWith(".jpeg".to_string()),
                    RuleCondition::ResourcePathEndsWith(".png".to_string()),
                    RuleCondition::ResourcePathEndsWith(".svg".to_string()),
                    RuleCondition::ResourcePathEndsWith(".webp".to_string()),
                    RuleCondition::ResourcePathEndsWith(".woff2".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Static)],
            ),
            ModuleRule::new(
                RuleCondition::any(vec![RuleCondition::ResourcePathEndsWith(
                    ".node".to_string(),
                )]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Raw)],
            ),
            ModuleRule::new(
                RuleCondition::any(vec![RuleCondition::ResourcePathEndsWith(
                    ".wasm".to_string(),
                )]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::WebAssembly {
                    source_ty: WebAssemblySourceType::Binary,
                })],
            ),
            ModuleRule::new(
                RuleCondition::any(vec![RuleCondition::ResourcePathEndsWith(
                    ".wat".to_string(),
                )]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::WebAssembly {
                    source_ty: WebAssemblySourceType::Text,
                })],
            ),
            ModuleRule::new(
                RuleCondition::ResourcePathHasNoExtension,
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: vendor_transforms.to_resolved().await?,
                    options: ecmascript_options_vc,
                })],
            ),
            ModuleRule::new(
                RuleCondition::ReferenceType(ReferenceType::Url(UrlReferenceSubType::Undefined)),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Static)],
            ),
        ];

        if enable_raw_css {
            rules.extend([
                ModuleRule::new(
                    RuleCondition::all(vec![RuleCondition::ResourcePathEndsWith(
                        ".css".to_string(),
                    )]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Default,
                    })],
                ),
                ModuleRule::new(
                    RuleCondition::all(vec![RuleCondition::ResourcePathEndsWith(
                        ".module.css".to_string(),
                    )]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
                    })],
                ),
            ]);
        } else {
            if let Some(options) = enable_postcss_transform {
                let options = options.await?;
                let execution_context = execution_context
                    .context("execution_context is required for the postcss_transform")?;

                let import_map = if let Some(postcss_package) = options.postcss_package {
                    package_import_map_from_import_mapping("postcss".into(), *postcss_package)
                } else {
                    package_import_map_from_context(
                        "postcss".into(),
                        path.context("need_path in ModuleOptions::new is incorrect")?,
                    )
                };

                rules.push(ModuleRule::new(
                    RuleCondition::ResourcePathEndsWith(".css".to_string()),
                    vec![ModuleRuleEffect::SourceTransforms(ResolvedVc::cell(vec![
                        ResolvedVc::upcast(
                            PostCssTransform::new(
                                node_evaluate_asset_context(
                                    *execution_context,
                                    Some(import_map),
                                    None,
                                    "postcss".into(),
                                    true,
                                ),
                                *execution_context,
                                options.config_location,
                                matches!(css_source_maps, SourceMapsType::Full),
                            )
                            .to_resolved()
                            .await?,
                        ),
                    ]))],
                ));
            }

            rules.extend([
                ModuleRule::new_all(
                    RuleCondition::ResourcePathEndsWith(".css".to_string()),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Default,
                    })],
                ),
                ModuleRule::new(
                    RuleCondition::all(vec![
                        RuleCondition::ResourcePathEndsWith(".module.css".to_string()),
                        // Only create a module CSS asset if not `@import`ed from CSS already.
                        // NOTE: `composes` references should not be treated as `@import`s and
                        // should also create a module CSS asset.
                        RuleCondition::not(RuleCondition::ReferenceType(ReferenceType::Css(
                            CssReferenceSubType::AtImport(None),
                        ))),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::CssModule)],
                ),
                ModuleRule::new(
                    RuleCondition::all(vec![
                        RuleCondition::ResourcePathEndsWith(".module.css".to_string()),
                        // Create a normal CSS asset if `@import`ed from CSS already.
                        RuleCondition::ReferenceType(ReferenceType::Css(
                            CssReferenceSubType::AtImport(None),
                        )),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
                    })],
                ),
                // Ecmascript CSS Modules referencing the actual CSS module to include it
                ModuleRule::new_internal(
                    RuleCondition::ResourcePathEndsWith(".module.css".to_string()),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
                    })],
                ),
                // Ecmascript CSS Modules referencing the actual CSS module to list the classes
                ModuleRule::new(
                    RuleCondition::all(vec![
                        RuleCondition::ReferenceType(ReferenceType::Css(
                            CssReferenceSubType::Analyze,
                        )),
                        RuleCondition::ResourcePathEndsWith(".module.css".to_string()),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
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

            let mdx_options = &*enable_mdx_rs
                .unwrap_or_else(|| MdxTransformOptions::default().resolved_cell())
                .await?;

            let mdx_transform_options = (MdxTransformOptions {
                development: Some(development),
                jsx: Some(false),
                jsx_runtime,
                jsx_import_source,
                ..(mdx_options.clone())
            })
            .cell();

            rules.push(ModuleRule::new(
                RuleCondition::any(vec![
                    RuleCondition::ResourcePathEndsWith(".md".to_string()),
                    RuleCondition::ResourcePathEndsWith(".mdx".to_string()),
                ]),
                vec![ModuleRuleEffect::SourceTransforms(ResolvedVc::cell(vec![
                    ResolvedVc::upcast(
                        MdxTransform::new(mdx_transform_options)
                            .to_resolved()
                            .await?,
                    ),
                ]))],
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
                    *loader_runner_package,
                )
            } else {
                package_import_map_from_context(
                    "loader-runner".into(),
                    path.context("need_path in ModuleOptions::new is incorrect")?,
                )
            };
            for (glob, rule) in webpack_loaders_options.rules.await?.iter() {
                rules.push(ModuleRule::new(
                    RuleCondition::All(vec![
                        if !glob.contains('/') {
                            RuleCondition::ResourceBasePathGlob(Glob::new(glob.clone()).await?)
                        } else {
                            RuleCondition::ResourcePathGlob {
                                base: execution_context.project_path().await?,
                                glob: Glob::new(glob.clone()).await?,
                            }
                        },
                        RuleCondition::not(RuleCondition::ResourceIsVirtualSource),
                    ]),
                    vec![ModuleRuleEffect::SourceTransforms(ResolvedVc::cell(vec![
                        ResolvedVc::upcast(
                            WebpackLoaders::new(
                                node_evaluate_asset_context(
                                    *execution_context,
                                    Some(import_map),
                                    None,
                                    "webpack_loaders".into(),
                                    false,
                                ),
                                *execution_context,
                                *rule.loaders,
                                rule.rename_as.clone(),
                                resolve_options_context,
                                matches!(ecmascript_source_maps, SourceMapsType::Full),
                            )
                            .to_resolved()
                            .await?,
                        ),
                    ]))],
                ));
            }
        }

        rules.extend(module_rules.iter().cloned());

        Ok(ModuleOptions::cell(ModuleOptions { rules }))
    }
}
