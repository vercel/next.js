pub mod module_options_context;
pub mod module_rule;
pub mod rule_condition;

use anyhow::{Context, Result};
pub use module_options_context::*;
pub use module_rule::*;
pub use rule_condition::*;
use turbo_tasks::primitives::{OptionStringVc, StringsVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    reference_type::{ReferenceType, UrlReferenceSubType},
    resolve::options::{ImportMap, ImportMapVc, ImportMapping, ImportMappingVc},
    source_transform::SourceTransformsVc,
};
use turbopack_css::{CssInputTransform, CssInputTransformsVc};
use turbopack_ecmascript::{
    EcmascriptInputTransform, EcmascriptInputTransformsVc, EcmascriptOptions, SpecifiedModuleType,
    TransformPluginVc,
};
use turbopack_ecmascript_plugins::transform::emotion::build_emotion_transformer;
use turbopack_mdx::MdxTransformOptions;
use turbopack_node::transforms::{postcss::PostCssTransformVc, webpack::WebpackLoadersVc};

use crate::evaluate_context::node_evaluate_asset_context;

#[turbo_tasks::function]
async fn package_import_map_from_import_mapping(
    package_name: &str,
    package_mapping: ImportMappingVc,
) -> Result<ImportMapVc> {
    let mut import_map = ImportMap::default();
    import_map.insert_exact_alias(
        format!("@vercel/turbopack/{}", package_name),
        package_mapping,
    );
    Ok(import_map.cell())
}

#[turbo_tasks::function]
async fn package_import_map_from_context(
    package_name: &str,
    context_path: FileSystemPathVc,
) -> Result<ImportMapVc> {
    let mut import_map = ImportMap::default();
    import_map.insert_exact_alias(
        format!("@vercel/turbopack/{}", package_name),
        ImportMapping::PrimaryAlternative(package_name.to_string(), Some(context_path)).cell(),
    );
    Ok(import_map.cell())
}

#[turbo_tasks::value(cell = "new", eq = "manual")]
pub struct ModuleOptions {
    pub rules: Vec<ModuleRule>,
}

#[turbo_tasks::value_impl]
impl ModuleOptionsVc {
    #[turbo_tasks::function]
    pub async fn new(
        path: FileSystemPathVc,
        context: ModuleOptionsContextVc,
    ) -> Result<ModuleOptionsVc> {
        let ModuleOptionsContext {
            enable_jsx,
            ref enable_emotion,
            enable_react_refresh,
            enable_styled_jsx,
            ref enable_styled_components,
            enable_types,
            enable_tree_shaking,
            ref enable_typescript_transform,
            ref decorators,
            enable_mdx,
            enable_mdx_rs,
            ref enable_postcss_transform,
            ref enable_webpack_loaders,
            preset_env_versions,
            ref custom_ecmascript_app_transforms,
            ref custom_ecmascript_transforms,
            ref custom_rules,
            execution_context,
            ref rules,
            ..
        } = *context.await?;
        if !rules.is_empty() {
            let path_value = path.await?;

            for (condition, new_context) in rules.iter() {
                if condition.matches(&path_value).await {
                    return Ok(ModuleOptionsVc::new(path, *new_context));
                }
            }
        }
        let mut transforms = custom_ecmascript_app_transforms.clone();
        transforms.extend(custom_ecmascript_transforms.iter().cloned());

        // Order of transforms is important. e.g. if the React transform occurs before
        // Styled JSX, there won't be JSX nodes for Styled JSX to transform.
        if enable_styled_jsx {
            transforms.push(EcmascriptInputTransform::StyledJsx);
        }

        if let Some(transformer) = build_emotion_transformer(enable_emotion).await? {
            transforms.push(EcmascriptInputTransform::Plugin(TransformPluginVc::cell(
                transformer,
            )));
        }

        if let Some(enable_styled_components) = enable_styled_components {
            let styled_components_transform = &*enable_styled_components.await?;
            transforms.push(EcmascriptInputTransform::StyledComponents {
                display_name: styled_components_transform.display_name,
                ssr: styled_components_transform.ssr,
                file_name: styled_components_transform.file_name,
                top_level_import_paths: StringsVc::cell(
                    styled_components_transform.top_level_import_paths.clone(),
                ),
                meaningless_file_names: StringsVc::cell(
                    styled_components_transform.meaningless_file_names.clone(),
                ),
                css_prop: styled_components_transform.css_prop,
                namespace: OptionStringVc::cell(styled_components_transform.namespace.clone()),
            });
        }
        if let Some(enable_jsx) = enable_jsx {
            let jsx = enable_jsx.await?;

            transforms.push(EcmascriptInputTransform::React {
                refresh: enable_react_refresh,
                import_source: OptionStringVc::cell(jsx.import_source.clone()),
                runtime: OptionStringVc::cell(jsx.runtime.clone()),
            });
        }

        let ecmascript_options = EcmascriptOptions {
            split_into_parts: enable_tree_shaking,
            import_parts: enable_tree_shaking,
            ..Default::default()
        };

        if let Some(env) = preset_env_versions {
            transforms.push(EcmascriptInputTransform::PresetEnv(env));
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

        let vendor_transforms =
            EcmascriptInputTransformsVc::cell(custom_ecmascript_transforms.clone());
        let ts_app_transforms = if let Some(transform) = &ts_transform {
            let mut base_transforms = if let Some(decorators_transform) = &decorators_transform {
                vec![decorators_transform.clone(), transform.clone()]
            } else {
                vec![transform.clone()]
            };
            base_transforms.extend(custom_ecmascript_transforms.iter().cloned());
            EcmascriptInputTransformsVc::cell(
                base_transforms
                    .iter()
                    .cloned()
                    .chain(transforms.iter().cloned())
                    .collect(),
            )
        } else {
            EcmascriptInputTransformsVc::cell(transforms.clone())
        };

        let css_transforms = CssInputTransformsVc::cell(vec![CssInputTransform::Nested]);
        let mdx_transforms = EcmascriptInputTransformsVc::cell(
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
        let app_transforms = EcmascriptInputTransformsVc::cell(
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
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".json".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Json)],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".css".to_string()),
                [
                    if let Some(options) = enable_postcss_transform {
                        let execution_context = execution_context
                            .context("execution_context is required for the postcss_transform")?
                            .with_layer("postcss");

                        let import_map = if let Some(postcss_package) = options.postcss_package {
                            package_import_map_from_import_mapping("postcss", postcss_package)
                        } else {
                            package_import_map_from_context("postcss", path)
                        };
                        Some(ModuleRuleEffect::SourceTransforms(
                            SourceTransformsVc::cell(vec![PostCssTransformVc::new(
                                node_evaluate_asset_context(
                                    execution_context.project_path(),
                                    Some(import_map),
                                    None,
                                ),
                                execution_context,
                            )
                            .into()]),
                        ))
                    } else {
                        None
                    },
                    Some(ModuleRuleEffect::ModuleType(ModuleType::Css(
                        css_transforms,
                    ))),
                ]
                .into_iter()
                .flatten()
                .collect(),
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".module.css".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::CssModule(
                    css_transforms,
                ))],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".jsx".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: app_transforms,
                    options: ecmascript_options.clone(),
                })],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".mjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: app_transforms,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::EcmaScript,
                        ..ecmascript_options
                    },
                })],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".cjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: app_transforms,
                    options: EcmascriptOptions {
                        specified_module_type: SpecifiedModuleType::CommonJs,
                        ..ecmascript_options
                    },
                })],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".tsx".to_string()),
                ]),
                vec![if enable_types {
                    ModuleRuleEffect::ModuleType(ModuleType::TypescriptWithTypes {
                        transforms: ts_app_transforms,
                        options: ecmascript_options.clone(),
                    })
                } else {
                    ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                        transforms: ts_app_transforms,
                        options: ecmascript_options.clone(),
                    })
                }],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".mts".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".mtsx".to_string()),
                ]),
                vec![if enable_types {
                    ModuleRuleEffect::ModuleType(ModuleType::TypescriptWithTypes {
                        transforms: ts_app_transforms,
                        options: EcmascriptOptions {
                            specified_module_type: SpecifiedModuleType::EcmaScript,
                            ..ecmascript_options
                        },
                    })
                } else {
                    ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                        transforms: ts_app_transforms,
                        options: EcmascriptOptions {
                            specified_module_type: SpecifiedModuleType::EcmaScript,
                            ..ecmascript_options
                        },
                    })
                }],
            ),
            ModuleRule::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".cts".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".ctsx".to_string()),
                ]),
                vec![if enable_types {
                    ModuleRuleEffect::ModuleType(ModuleType::TypescriptWithTypes {
                        transforms: ts_app_transforms,
                        options: EcmascriptOptions {
                            specified_module_type: SpecifiedModuleType::CommonJs,
                            ..ecmascript_options
                        },
                    })
                } else {
                    ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                        transforms: ts_app_transforms,
                        options: EcmascriptOptions {
                            specified_module_type: SpecifiedModuleType::CommonJs,
                            ..ecmascript_options
                        },
                    })
                }],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ResourcePathEndsWith(".d.ts".to_string()),
                vec![ModuleRuleEffect::ModuleType(
                    ModuleType::TypescriptDeclaration {
                        transforms: vendor_transforms,
                        options: ecmascript_options.clone(),
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
                ModuleRuleCondition::ResourcePathHasNoExtension,
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    transforms: vendor_transforms,
                    options: ecmascript_options.clone(),
                })],
            ),
            ModuleRule::new(
                ModuleRuleCondition::ReferenceType(ReferenceType::Url(
                    UrlReferenceSubType::Undefined,
                )),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Static)],
            ),
        ];

        if enable_mdx || enable_mdx_rs {
            let (jsx_runtime, jsx_import_source) = if let Some(enable_jsx) = enable_jsx {
                let jsx = enable_jsx.await?;
                (jsx.runtime.clone(), jsx.import_source.clone())
            } else {
                (None, None)
            };

            let mdx_transform_options = (MdxTransformOptions {
                development: true,
                preserve_jsx: false,
                jsx_runtime,
                jsx_import_source,
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
                })],
            ));
        }

        if let Some(webpack_loaders_options) = enable_webpack_loaders {
            let execution_context = execution_context
                .context("execution_context is required for webpack_loaders")?
                .with_layer("webpack_loaders");
            let import_map = if let Some(loader_runner_package) =
                webpack_loaders_options.loader_runner_package
            {
                package_import_map_from_import_mapping("loader-runner", loader_runner_package)
            } else {
                package_import_map_from_context("loader-runner", path)
            };
            for (ext, loaders) in webpack_loaders_options.extension_to_loaders.iter() {
                rules.push(ModuleRule::new(
                    ModuleRuleCondition::All(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(ext.to_string()),
                        ModuleRuleCondition::not(ModuleRuleCondition::ResourceIsVirtualAsset),
                    ]),
                    vec![
                        ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                            transforms: app_transforms,
                            options: ecmascript_options.clone(),
                        }),
                        ModuleRuleEffect::SourceTransforms(SourceTransformsVc::cell(vec![
                            WebpackLoadersVc::new(
                                node_evaluate_asset_context(
                                    execution_context.project_path(),
                                    Some(import_map),
                                    None,
                                ),
                                execution_context,
                                *loaders,
                            )
                            .into(),
                        ])),
                    ],
                ));
            }
        }

        rules.extend(custom_rules.iter().cloned());

        Ok(ModuleOptionsVc::cell(ModuleOptions { rules }))
    }
}
