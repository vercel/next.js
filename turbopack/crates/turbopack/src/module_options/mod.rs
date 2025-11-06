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
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{IntoTraitRef, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{
    FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbopack_core::{
    chunk::SourceMapsType,
    ident::Layer,
    reference_type::{CssReferenceSubType, ReferenceType, UrlReferenceSubType},
    resolve::options::{ImportMap, ImportMapping},
};
use turbopack_css::CssModuleAssetType;
use turbopack_ecmascript::{
    EcmascriptInputTransform, EcmascriptInputTransforms, EcmascriptOptions, SpecifiedModuleType,
};
use turbopack_mdx::MdxTransform;
use turbopack_node::{
    execution_context::ExecutionContext,
    transforms::{postcss::PostCssTransform, webpack::WebpackLoaders},
};
use turbopack_wasm::source::WebAssemblySourceType;

use crate::{
    evaluate_context::node_evaluate_asset_context, resolve_options_context::ResolveOptionsContext,
};

#[turbo_tasks::function]
fn package_import_map_from_import_mapping(
    package_name: RcStr,
    package_mapping: ResolvedVc<ImportMapping>,
) -> Vc<ImportMap> {
    let mut import_map = ImportMap::default();
    import_map.insert_exact_alias(
        RcStr::from(format!("@vercel/turbopack/{package_name}")),
        package_mapping,
    );
    import_map.cell()
}

#[turbo_tasks::function]
fn package_import_map_from_context(
    package_name: RcStr,
    context_path: FileSystemPath,
) -> Vc<ImportMap> {
    let mut import_map = ImportMap::default();
    import_map.insert_exact_alias(
        RcStr::from(format!("@vercel/turbopack/{package_name}")),
        ImportMapping::PrimaryAlternative(package_name, Some(context_path)).resolved_cell(),
    );
    import_map.cell()
}

async fn rule_condition_from_webpack_condition_glob(
    execution_context: ResolvedVc<ExecutionContext>,
    glob: &RcStr,
) -> Result<RuleCondition> {
    Ok(if glob.contains('/') {
        RuleCondition::ResourcePathGlob {
            base: execution_context.project_path().owned().await?,
            glob: Glob::new(glob.clone(), GlobOptions::default()).await?,
        }
    } else {
        RuleCondition::ResourceBasePathGlob(Glob::new(glob.clone(), GlobOptions::default()).await?)
    })
}

async fn rule_condition_from_webpack_condition(
    execution_context: ResolvedVc<ExecutionContext>,
    builtin_conditions: &dyn WebpackLoaderBuiltinConditionSet,
    webpack_loader_condition: &ConditionItem,
) -> Result<RuleCondition> {
    Ok(match webpack_loader_condition {
        ConditionItem::All(conds) => RuleCondition::All(
            conds
                .iter()
                .map(|c| {
                    rule_condition_from_webpack_condition(execution_context, builtin_conditions, c)
                })
                .try_join()
                .await?,
        ),
        ConditionItem::Any(conds) => RuleCondition::Any(
            conds
                .iter()
                .map(|c| {
                    rule_condition_from_webpack_condition(execution_context, builtin_conditions, c)
                })
                .try_join()
                .await?,
        ),
        ConditionItem::Not(cond) => RuleCondition::Not(Box::new(
            Box::pin(rule_condition_from_webpack_condition(
                execution_context,
                builtin_conditions,
                cond,
            ))
            .await?,
        )),
        ConditionItem::Builtin(name) => match builtin_conditions.match_condition(name) {
            WebpackLoaderBuiltinConditionSetMatch::Matched => RuleCondition::True,
            WebpackLoaderBuiltinConditionSetMatch::Unmatched => RuleCondition::False,
            WebpackLoaderBuiltinConditionSetMatch::Invalid => {
                // We don't expect the user to hit this because whatever deserailizes the user
                // configuration should validate conditions itself
                anyhow::bail!("{name:?} is not a valid built-in condition")
            }
        },
        ConditionItem::Base { path, content } => {
            let mut rule_conditions = Vec::new();
            match &path {
                Some(ConditionPath::Glob(glob)) => rule_conditions.push(
                    rule_condition_from_webpack_condition_glob(execution_context, glob).await?,
                ),
                Some(ConditionPath::Regex(regex)) => {
                    rule_conditions.push(RuleCondition::ResourcePathEsRegex(regex.await?));
                }
                None => {}
            }
            if let Some(content) = content {
                rule_conditions.push(RuleCondition::ResourceContentEsRegex(content.await?));
            }
            RuleCondition::All(rule_conditions)
        }
    })
}

#[turbo_tasks::value(cell = "new", eq = "manual")]
pub struct ModuleOptions {
    pub rules: Vec<ModuleRule>,
}

#[turbo_tasks::value_impl]
impl ModuleOptions {
    #[turbo_tasks::function]
    pub async fn new(
        path: FileSystemPath,
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
            for (condition, new_context) in rules.iter() {
                if condition.matches(&path) {
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
        path: Option<FileSystemPath>,
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
                    enable_typeof_window_inlining,
                    source_maps: ecmascript_source_maps,
                    inline_helpers,
                    ..
                },
            enable_mdx,
            enable_mdx_rs,
            css:
                CssOptionsContext {
                    enable_raw_css,
                    source_maps: css_source_maps,
                    ref module_css_condition,
                    ..
                },
            ref enable_postcss_transform,
            ref enable_webpack_loaders,
            environment,
            ref module_rules,
            execution_context,
            tree_shaking_mode,
            keep_last_successful_parse,
            analyze_mode,
            ..
        } = *module_options_context.await?;

        let module_css_condition = module_css_condition.clone().unwrap_or_else(|| {
            RuleCondition::any(vec![
                RuleCondition::ResourcePathEndsWith(".module.css".to_string()),
                RuleCondition::ContentTypeStartsWith("text/css+module".to_string()),
            ])
        });

        // For React Client References, the CSS Module "facade" module lives in the parent (server)
        // module context, but the facade's references should be transitioned to the client (and
        // only then be processed with Webpack/PostCSS).
        //
        // Note that this is not an exhaustive condition for PostCSS/Webpack, but excludes certain
        // cases, so it should be added conjunctively together with CSS Module rule.
        //
        // If module css, then only when (Inner or Analyze or Compose)
        // <=> (not (module css)) or (Inner or Analyzer or Compose)
        //
        // So only if this is not a CSS module, or one of the special reference type constraints.
        let module_css_external_transform_conditions = RuleCondition::Any(vec![
            RuleCondition::not(module_css_condition.clone()),
            RuleCondition::ReferenceType(ReferenceType::Css(CssReferenceSubType::Inner)),
            RuleCondition::ReferenceType(ReferenceType::Css(CssReferenceSubType::Analyze)),
        ]);

        let mut ecma_preprocess = vec![];
        let mut postprocess = vec![];

        // Order of transforms is important. e.g. if the React transform occurs before
        // Styled JSX, there won't be JSX nodes for Styled JSX to transform.
        // If a custom plugin requires specific order _before_ core transform kicks in,
        // should use `before_transform_plugins`.
        if let Some(enable_jsx) = enable_jsx {
            let jsx = enable_jsx.await?;

            postprocess.push(EcmascriptInputTransform::React {
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
            extract_source_map: matches!(ecmascript_source_maps, SourceMapsType::Full),
            keep_last_successful_parse,
            analyze_mode,
            enable_typeof_window_inlining,
            inline_helpers,
            ..Default::default()
        };
        let ecmascript_options_vc = ecmascript_options.resolved_cell();

        if let Some(environment) = environment {
            postprocess.push(EcmascriptInputTransform::PresetEnv(environment));
        }

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

        if let Some(decorators_transform) = &decorators_transform {
            // Apply decorators transform for the ModuleType::Ecmascript as well after
            // constructing ts_app_transforms. Ecmascript can have decorators for
            // the cases of 1. using jsconfig, to enable ts-specific runtime
            // decorators (i.e legacy) 2. ecma spec decorators
            //
            // Since typescript transform (`ts_app_transforms`) needs to apply decorators
            // _before_ stripping types, we create ts_app_transforms first in a
            // specific order with typescript, then apply decorators to app_transforms.
            ecma_preprocess.splice(0..0, [decorators_transform.clone()]);
        }

        let ecma_preprocess = ResolvedVc::cell(ecma_preprocess);
        let main = ResolvedVc::<EcmascriptInputTransforms>::cell(vec![]);
        let postprocess = ResolvedVc::cell(postprocess);
        let empty = ResolvedVc::<EcmascriptInputTransforms>::cell(vec![]);

        let mut rules = vec![
            ModuleRule::new_all(
                RuleCondition::any(vec![
                    RuleCondition::ResourcePathEndsWith(".json".to_string()),
                    RuleCondition::ContentTypeStartsWith("application/json".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Json)],
            ),
            ModuleRule::new_all(
                RuleCondition::any(vec![
                    RuleCondition::ResourcePathEndsWith(".js".to_string()),
                    RuleCondition::ResourcePathEndsWith(".jsx".to_string()),
                    RuleCondition::ContentTypeStartsWith("application/javascript".to_string()),
                    RuleCondition::ContentTypeStartsWith("text/javascript".to_string()),
                ]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    preprocess: ecma_preprocess,
                    main,
                    postprocess,
                    options: ecmascript_options_vc,
                })],
            ),
            ModuleRule::new_all(
                RuleCondition::ResourcePathEndsWith(".mjs".to_string()),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                    preprocess: ecma_preprocess,
                    main,
                    postprocess,
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
                    preprocess: ecma_preprocess,
                    main,
                    postprocess,
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
                        preprocess: empty,
                        main: empty,
                        postprocess: empty,
                        options: ecmascript_options_vc,
                    },
                )],
            ),
            ModuleRule::new(
                RuleCondition::any(vec![RuleCondition::ResourcePathEndsWith(
                    ".node".to_string(),
                )]),
                vec![ModuleRuleEffect::ModuleType(ModuleType::NodeAddon)],
            ),
            // WebAssembly
            ModuleRule::new(
                RuleCondition::any(vec![
                    RuleCondition::ResourcePathEndsWith(".wasm".to_string()),
                    RuleCondition::ContentTypeStartsWith("application/wasm".to_string()),
                ]),
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
            // Fallback to ecmascript without extension (this is node.js behavior)
            ModuleRule::new(
                RuleCondition::all(vec![
                    RuleCondition::ResourcePathHasNoExtension,
                    RuleCondition::ContentTypeEmpty,
                ]),
                vec![ModuleRuleEffect::ModuleType(
                    ModuleType::EcmascriptExtensionless {
                        preprocess: empty,
                        main: empty,
                        postprocess: empty,
                        options: ecmascript_options_vc,
                    },
                )],
            ),
            // Static assets
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
                vec![ModuleRuleEffect::ModuleType(ModuleType::StaticUrlJs {
                    tag: None,
                })],
            ),
            ModuleRule::new(
                RuleCondition::ReferenceType(ReferenceType::Url(UrlReferenceSubType::Undefined)),
                vec![ModuleRuleEffect::ModuleType(ModuleType::StaticUrlJs {
                    tag: None,
                })],
            ),
            ModuleRule::new(
                RuleCondition::ReferenceType(ReferenceType::Url(
                    UrlReferenceSubType::EcmaScriptNewUrl,
                )),
                vec![ModuleRuleEffect::ModuleType(ModuleType::StaticUrlJs {
                    tag: None,
                })],
            ),
            ModuleRule::new(
                RuleCondition::ReferenceType(ReferenceType::Url(UrlReferenceSubType::CssUrl)),
                vec![ModuleRuleEffect::ModuleType(ModuleType::StaticUrlCss {
                    tag: None,
                })],
            ),
        ];

        if let Some(options) = enable_typescript_transform {
            let ts_preprocess = ResolvedVc::cell(
                decorators_transform
                    .clone()
                    .into_iter()
                    .chain(std::iter::once(EcmascriptInputTransform::TypeScript {
                        use_define_for_class_fields: options.await?.use_define_for_class_fields,
                    }))
                    .collect(),
            );

            rules.splice(
                0..0,
                [
                    ModuleRule::new_all(
                        RuleCondition::ResourcePathEndsWith(".ts".to_string()),
                        vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                            preprocess: ts_preprocess,
                            main,
                            postprocess,
                            tsx: false,
                            analyze_types: enable_types,
                            options: ecmascript_options_vc,
                        })],
                    ),
                    ModuleRule::new_all(
                        RuleCondition::ResourcePathEndsWith(".tsx".to_string()),
                        vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                            preprocess: ts_preprocess,
                            main,
                            postprocess,
                            tsx: true,
                            analyze_types: enable_types,
                            options: ecmascript_options_vc,
                        })],
                    ),
                    ModuleRule::new_all(
                        RuleCondition::ResourcePathEndsWith(".mts".to_string()),
                        vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript {
                            preprocess: ts_preprocess,
                            main,
                            postprocess,
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
                            preprocess: ts_preprocess,
                            main,
                            postprocess,
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
                            preprocess: ts_preprocess,
                            main,
                            postprocess,
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
                            preprocess: ts_preprocess,
                            main,
                            postprocess,
                            tsx: true,
                            analyze_types: enable_types,
                            options: EcmascriptOptions {
                                specified_module_type: SpecifiedModuleType::CommonJs,
                                ..ecmascript_options
                            }
                            .resolved_cell(),
                        })],
                    ),
                ],
            );
        }

        if let Some(webpack_loaders_options) = enable_webpack_loaders {
            let webpack_loaders_options = webpack_loaders_options.await?;
            let execution_context =
                execution_context.context("execution_context is required for webpack_loaders")?;
            let import_map = if let Some(loader_runner_package) =
                webpack_loaders_options.loader_runner_package
            {
                package_import_map_from_import_mapping(
                    rcstr!("loader-runner"),
                    *loader_runner_package,
                )
            } else {
                package_import_map_from_context(
                    rcstr!("loader-runner"),
                    path.clone()
                        .context("need_path in ModuleOptions::new is incorrect")?,
                )
            };
            let builtin_conditions = webpack_loaders_options
                .builtin_conditions
                .into_trait_ref()
                .await?;
            for (key, rule) in webpack_loaders_options.rules.await?.iter() {
                let mut rule_conditions = Vec::new();

                // prefer to add the glob condition ahead of the user-defined `condition` field,
                // because we know it's cheap to check
                rule_conditions.push(
                    rule_condition_from_webpack_condition_glob(execution_context, key).await?,
                );

                if let Some(condition) = &rule.condition {
                    rule_conditions.push(
                        rule_condition_from_webpack_condition(
                            execution_context,
                            &*builtin_conditions,
                            condition,
                        )
                        .await?,
                    )
                }

                rule_conditions.push(RuleCondition::not(RuleCondition::ResourceIsVirtualSource));
                rule_conditions.push(module_css_external_transform_conditions.clone());

                let mut all_rule_condition = RuleCondition::All(rule_conditions);
                all_rule_condition.flatten();
                if !matches!(all_rule_condition, RuleCondition::False) {
                    rules.push(ModuleRule::new(
                        all_rule_condition,
                        vec![ModuleRuleEffect::SourceTransforms(ResolvedVc::cell(vec![
                            ResolvedVc::upcast(
                                WebpackLoaders::new(
                                    node_evaluate_asset_context(
                                        *execution_context,
                                        Some(import_map),
                                        None,
                                        Layer::new(rcstr!("webpack_loaders")),
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
        }

        if enable_raw_css {
            rules.extend([
                ModuleRule::new(
                    RuleCondition::any(vec![
                        RuleCondition::ResourcePathEndsWith(".css".to_string()),
                        RuleCondition::ContentTypeStartsWith("text/css".to_string()),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Default,
                        environment,
                    })],
                ),
                ModuleRule::new(
                    module_css_condition.clone(),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
                        environment,
                    })],
                ),
            ]);
        } else {
            if let Some(options) = enable_postcss_transform {
                let options = options.await?;
                let execution_context = execution_context
                    .context("execution_context is required for the postcss_transform")?;

                let import_map = if let Some(postcss_package) = options.postcss_package {
                    package_import_map_from_import_mapping(rcstr!("postcss"), *postcss_package)
                } else {
                    package_import_map_from_context(
                        rcstr!("postcss"),
                        path.clone()
                            .context("need_path in ModuleOptions::new is incorrect")?,
                    )
                };

                rules.push(ModuleRule::new(
                    RuleCondition::All(vec![
                        RuleCondition::Any(vec![
                            // Both CSS and CSS Modules
                            RuleCondition::ResourcePathEndsWith(".css".to_string()),
                            RuleCondition::ContentTypeStartsWith("text/css".to_string()),
                            module_css_condition.clone(),
                        ]),
                        module_css_external_transform_conditions.clone(),
                    ]),
                    vec![ModuleRuleEffect::SourceTransforms(ResolvedVc::cell(vec![
                        ResolvedVc::upcast(
                            PostCssTransform::new(
                                node_evaluate_asset_context(
                                    *execution_context,
                                    Some(import_map),
                                    None,
                                    Layer::new(rcstr!("postcss")),
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
                    RuleCondition::Any(vec![
                        RuleCondition::ResourcePathEndsWith(".css".to_string()),
                        RuleCondition::ContentTypeStartsWith("text/css".to_string()),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Default,
                        environment,
                    })],
                ),
                ModuleRule::new(
                    RuleCondition::all(vec![
                        module_css_condition.clone(),
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
                        module_css_condition.clone(),
                        // Create a normal CSS asset if `@import`ed from CSS already.
                        RuleCondition::ReferenceType(ReferenceType::Css(
                            CssReferenceSubType::AtImport(None),
                        )),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
                        environment,
                    })],
                ),
                // Ecmascript CSS Modules referencing the actual CSS module to include it
                ModuleRule::new(
                    RuleCondition::all(vec![
                        RuleCondition::ReferenceType(ReferenceType::Css(
                            CssReferenceSubType::Inner,
                        )),
                        module_css_condition.clone(),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
                        environment,
                    })],
                ),
                // Ecmascript CSS Modules referencing the actual CSS module to list the classes
                ModuleRule::new(
                    RuleCondition::all(vec![
                        RuleCondition::ReferenceType(ReferenceType::Css(
                            CssReferenceSubType::Analyze,
                        )),
                        module_css_condition.clone(),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css {
                        ty: CssModuleAssetType::Module,
                        environment,
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
                    RuleCondition::ContentTypeStartsWith("text/markdown".to_string()),
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

        rules.extend(module_rules.iter().cloned());

        Ok(ModuleOptions::cell(ModuleOptions { rules }))
    }
}
