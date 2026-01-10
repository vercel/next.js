use std::fmt;

use anyhow::{Result, bail};
use turbo_esregex::EsRegex;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileSystem, FileSystemPath, to_sys_path};
use turbopack::{
    ModuleAssetContext,
    module_options::{
        ConditionItem, EcmascriptOptionsContext, EmptyWebpackLoaderBuiltinConditionSet,
        JsxTransformOptions, LoaderRuleItem, ModuleOptionsContext, ModuleRule, ModuleRuleEffect,
        ModuleType, RuleCondition, TypescriptTransformOptions, WebpackLoadersOptions,
    },
};
use turbopack_browser::react_refresh::assert_can_resolve_react_refresh;
use turbopack_core::{
    chunk::SourceMapsType,
    compile_time_defines,
    compile_time_info::{CompileTimeDefines, CompileTimeInfo},
    condition::ContextCondition,
    context::AssetContext,
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
    free_var_references,
    ident::Layer,
    reference_type::{CommonJsReferenceSubType, ReferenceType, ReferenceTypeCondition},
    resolve::{
        ExternalTraced, ExternalType, ResolveResultItem,
        options::{ImportMap, ImportMapping},
        parse::Request,
    },
    source::Source,
};
use turbopack_ecmascript::TreeShakingMode;
use turbopack_node::{
    execution_context::ExecutionContext,
    transforms::{postcss::PostCssTransformOptions, webpack::WebpackLoaderItem},
};
use turbopack_resolve::{
    ecmascript::apply_cjs_specific_options,
    resolve_options_context::{ResolveOptionsContext, TsConfigHandling},
};

use crate::asset_registry::ReactNativeStructuredAssetModuleType;

#[turbo_tasks::value(shared)]
pub enum NodeEnv {
    Development,
    Production,
}

impl fmt::Display for NodeEnv {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NodeEnv::Development => f.write_str("development"),
            NodeEnv::Production => f.write_str("production"),
        }
    }
}

fn foreign_code_context_condition() -> ContextCondition {
    ContextCondition::InDirectory("node_modules".to_string())
}

#[turbo_tasks::function]
pub async fn get_client_import_map(
    _project_path: FileSystemPath,
    app_path: FileSystemPath,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    import_map.insert_singleton_alias(rcstr!("@swc/helpers"), app_path.clone());
    import_map.insert_singleton_alias(rcstr!("styled-jsx"), app_path.clone());
    import_map.insert_singleton_alias(rcstr!("react"), app_path.clone());
    import_map.insert_singleton_alias(rcstr!("react-dom"), app_path.clone());
    import_map.insert_singleton_alias(rcstr!("@react-native/js-polyfills"), app_path.clone());
    import_map.insert_singleton_alias(rcstr!("expo"), app_path.clone());
    import_map.insert_singleton_alias(rcstr!("react-native"), app_path.clone());
    import_map.insert_singleton_alias(rcstr!("react-native-url-polyfill"), app_path.clone());

    import_map.insert_wildcard_alias(
        rcstr!("@vercel/turbopack-ecmascript-runtime/"),
        ImportMapping::PrimaryAlternative(
            rcstr!("./*"),
            Some(
                turbopack_ecmascript_runtime::embed_fs()
                    .root()
                    .owned()
                    .await?,
            ),
        )
        .resolved_cell(),
    );

    Ok(import_map.cell())
}

#[turbo_tasks::function]
pub async fn get_client_resolve_options_context(
    project_path: FileSystemPath,
    app_path: FileSystemPath,
    _node_env: Vc<NodeEnv>,
    platform: Option<RcStr>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_client_import_map = get_client_import_map(project_path.clone(), app_path)
        .to_resolved()
        .await?;
    let module_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().owned().await?),
        import_map: Some(next_client_import_map),
        enable_react_native_infix: platform,
        browser: true,
        module: true,
        react_native: true,
        enable_react: true,
        // The ecosystem relies on Typescript in node_modules, e.g.
        // - node_modules/@expo/metro-runtime/src/index.ts
        // - node_modules/expo-haptics/src/Haptics.ts
        // - node_modules/expo-image/src/index.ts
        // - node_modules/expo-modules-core/src/index.ts
        // - node_modules/expo/src/Expo.ts
        // - node_modules/react-native-gesture-handler/lib/module/handlers/
        //   NativeViewGestureHandler.ts
        enable_typescript: true,
        // There are invalid tsconfig.json files in the wild e.g. `extend`ing a dev-dependency which
        // isn't resolvable.
        tsconfig_path: TsConfigHandling::Disabled,
        ..Default::default()
    };
    Ok(ResolveOptionsContext {
        tsconfig_path: TsConfigHandling::ContextFile,
        rules: vec![(
            foreign_code_context_condition(),
            module_options_context.clone().resolved_cell(),
        )],
        ..module_options_context
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn detect_react_native_worklets_package(
    path: FileSystemPath,
    resolve_options_context: Vc<ResolveOptionsContext>,
) -> Result<Vc<Option<String>>> {
    let resolve_options = apply_cjs_specific_options(turbopack_resolve::resolve::resolve_options(
        path.clone(),
        resolve_options_context,
    ));
    let result = turbopack_core::resolve::resolve(
        path.clone(),
        ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
        Request::parse_string(rcstr!("react-native-worklets/plugin")),
        resolve_options,
    )
    .await?;
    if !result.is_unresolvable() {
        if let Some((_, ResolveResultItem::Source(source))) = result.primary.first() {
            return Ok(Vc::cell(Some(
                to_sys_path(source.ident().await?.path.clone())
                    .await?
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .to_string(),
            )));
        } else {
            bail!(
                "Unexpected resolve result for react-native-worklets/plugin: {:?}",
                result.primary.first()
            );
        }
    }

    let result = turbopack_core::resolve::resolve(
        path.clone(),
        ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
        Request::parse_string(rcstr!("react-native-reanimated/plugin")),
        resolve_options,
    )
    .await?;
    if !result.is_unresolvable() {
        if let Some((_, ResolveResultItem::Source(source))) = result.primary.first() {
            return Ok(Vc::cell(Some(
                to_sys_path(source.ident().await?.path.clone())
                    .await?
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .to_string(),
            )));
        } else {
            bail!(
                "Unexpected resolve result for react-native-worklets/plugin: {:?}",
                result.primary.first()
            );
        }
    }

    Ok(Vc::cell(None))
}

#[turbo_tasks::function]
pub async fn detect_babel_plugin_package(
    path: FileSystemPath,
    resolve_options_context: Vc<ResolveOptionsContext>,
    name: RcStr,
) -> Result<Vc<Option<String>>> {
    let resolve_options = apply_cjs_specific_options(turbopack_resolve::resolve::resolve_options(
        path.clone(),
        resolve_options_context,
    ));
    let result = turbopack_core::resolve::resolve(
        path.clone(),
        ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
        Request::parse_string(name.clone()),
        resolve_options,
    )
    .await?;
    if !result.is_unresolvable() {
        if let Some((_, ResolveResultItem::Source(source))) = result.primary.first() {
            return Ok(Vc::cell(Some(
                to_sys_path(source.ident().await?.path.clone())
                    .await?
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .to_string(),
            )));
        } else {
            bail!(
                "Unexpected resolve result for react-native-worklets/plugin: {:?}",
                result.primary.first()
            );
        }
    }

    Ok(Vc::cell(None))
}

#[turbo_tasks::function]
async fn get_client_module_options_context(
    project_path: FileSystemPath,
    app_path: FileSystemPath,
    execution_context: ResolvedVc<ExecutionContext>,
    env: ResolvedVc<Environment>,
    node_env: Vc<NodeEnv>,
    source_maps_type: SourceMapsType,
    platform: Option<RcStr>,
) -> Result<Vc<ModuleOptionsContext>> {
    let is_dev = matches!(*node_env.await?, NodeEnv::Development);

    let resolve_options_context = get_client_resolve_options_context(
        project_path.clone(),
        app_path.clone(),
        node_env,
        platform,
    );

    let react_native_worklets_package =
        detect_react_native_worklets_package(app_path.clone(), resolve_options_context)
            .owned()
            .await?;

    let babel_plugin_macros_name = detect_babel_plugin_package(
        app_path.clone(),
        resolve_options_context,
        rcstr!("babel-plugin-macros"),
    )
    .owned()
    .await?;
    let babel_preset_flow_name = detect_babel_plugin_package(
        app_path.clone(),
        resolve_options_context,
        rcstr!("@babel/preset-flow"),
    )
    .owned()
    .await?;
    let babel_plugin_syntax_jsx_name = detect_babel_plugin_package(
        app_path.clone(),
        resolve_options_context,
        rcstr!("@babel/plugin-syntax-jsx"),
    )
    .owned()
    .await?;
    let babel_plugin_codegen_name = detect_babel_plugin_package(
        app_path.clone(),
        resolve_options_context,
        rcstr!("@react-native/babel-plugin-codegen"),
    )
    .owned()
    .await?;
    let babel_plugin_syntax_typescript_name = detect_babel_plugin_package(
        app_path.clone(),
        resolve_options_context,
        rcstr!("@babel/plugin-syntax-typescript"),
    )
    .owned()
    .await?;

    let webpack_rules = vec![(
        rcstr!("*.{js,jsx,cjs,mjs,ts,tsx}"),
        LoaderRuleItem {
            rename_as: Some(rcstr!("*")),
            module_type: None,
            condition: Some(ConditionItem::Base {
                path: None,
                content: Some(
                    EsRegex::new(
                        [
                            // Flow syntax
                            "@flow",
                            // codegen
                            "codegenNativeComponent<",
                        ]
                        .into_iter()
                        .chain(
                            react_native_worklets_package
                                .as_ref()
                                .map(|_| {
                                    [
                                        // Explicit worklets
                                        "'worklet'",
                                        "\"worklet\"",
                                        // https://github.com/software-mansion/react-native-reanimated/blob/ce9032c25e088e09bcce519963614cc5355beebb/packages/react-native-worklets/plugin/src/autoworkletization.ts#L16
                                        "useAnimatedScrollHandler",
                                        "react-native-gesture-handler",
                                        "useFrameCallback",
                                        "useAnimatedStyle",
                                        "useAnimatedProps",
                                        "createAnimatedPropAdapter",
                                        "useDerivedValue",
                                        "useAnimatedScrollHandler",
                                        "useAnimatedReaction",
                                        "withTiming",
                                        "withSpring",
                                        "withDecay",
                                        "withRepeat",
                                        "runOnUI",
                                        "executeOnUIRuntimeSync",
                                        "scheduleOnUI",
                                        "runOnUISync",
                                        "runOnUIAsync",
                                        "runOnRuntime",
                                        "scheduleOnRuntime",
                                    ]
                                })
                                .into_iter()
                                .flatten(),
                        )
                        .chain(
                            babel_plugin_macros_name
                                .as_ref()
                                .map(|_| {
                                    [
                                        // babel-plugin-macro
                                        "[./]macro(\\.c?js)?[\"']",
                                    ]
                                    .into_iter()
                                })
                                .into_iter()
                                .flatten(),
                        )
                        .collect::<Vec<_>>()
                        .join("|")
                        .as_str(),
                        "",
                    )?
                    .resolved_cell(),
                ),
            }),
            loaders: ResolvedVc::cell(vec![WebpackLoaderItem {
                loader: rcstr!(
                    "/Users/niklas/code/next.js-rn/packages/turbopack-rn-babel-loader/index.js"
                ),
                options: [
                    (
                        "cwd".to_string(),
                        Some(
                            to_sys_path(app_path.clone())
                                .await?
                                .unwrap()
                                .to_str()
                                .unwrap()
                                .to_string(),
                        )
                        .into(),
                    ),
                    (
                        "workletPluginName".to_string(),
                        react_native_worklets_package.into(),
                    ),
                    (
                        "babelPluginMacrosName".to_string(),
                        babel_plugin_macros_name.into(),
                    ),
                    (
                        "babelPresetFlowName".to_string(),
                        babel_preset_flow_name.into(),
                    ),
                    (
                        "babelPluginSyntaxJsxName".to_string(),
                        babel_plugin_syntax_jsx_name.into(),
                    ),
                    (
                        "babelPluginCodegenName".to_string(),
                        babel_plugin_codegen_name.into(),
                    ),
                    (
                        "babelPluginSyntaxTypescriptName".to_string(),
                        babel_plugin_syntax_typescript_name.into(),
                    ),
                ]
                .into_iter()
                .collect(),
            }]),
        },
    )];

    // TODO merge these separate babel-loader runs
    // Use separately without @react-native/babel-preset
    // (
    //     "presets".to_string(),
    //     // TODO only if @flow
    //     serde_json::json!([
    //         ["@babel/preset-flow", { "experimental_useHermesParser": true }],
    //     ]),
    // ),
    // (
    //     "plugins".to_string(),
    //     // TODO only if codegenNativeComponent<
    //     serde_json::json!([["@react-native/babel-plugin-codegen", {}]]),
    // ),

    // let mut webpack_rules = vec![(
    //     rcstr!("*.{js,jsx,cjs,mjs,ts,tsx}"),
    //     LoaderRuleItem {
    //         loaders: ResolvedVc::cell(vec![WebpackLoaderItem {
    //             loader:
    // rcstr!("/Users/niklas/code/next.js-rn/packages/turbopack-rn-babel-loader/index.js"),
    //             options: [
    //                 ("configFile".to_string(), false.into()),
    //                 ("babelrc".to_string(), false.into()),
    //                 (
    //                     "presets".to_string(),
    //                     serde_json::json!([["@react-native/babel-preset", {}],]),
    //                 ),
    //             ]
    //             .into_iter()
    //             .collect(),
    //         }]),
    //         rename_as: Some(rcstr!("*")),
    //         condition: Some(ConditionItem::Base {
    //             path: None,
    //             content: Some(EsRegex::new("@flow|codegenNativeComponent<",
    // "")?.resolved_cell()),         }),
    //     },
    // )];

    // if *is_react_native_worklets_installed(project_path.clone(), resolve_options_context).await?
    // {     webpack_rules.push((
    //         rcstr!("*.{js,jsx,cjs,mjs,ts,tsx}"),
    //         LoaderRuleItem {
    //             loaders: ResolvedVc::cell(vec![WebpackLoaderItem {
    //                 loader: rcstr!("babel-loader"),
    //                 options: [
    //                     ("configFile".to_string(), false.into()),
    //                     ("babelrc".to_string(), false.into()),
    //                     (
    //                         "plugins".to_string(),
    //                         serde_json::json!([
    //                             "@babel/plugin-syntax-jsx",
    //                             "react-native-worklets/plugin"
    //                         ]),
    //                     ),
    //                 ]
    //                 .into_iter()
    //                 .collect(),
    //             }]),
    //             rename_as: Some(rcstr!("*")),
    //             condition: Some(ConditionItem::Base {
    //                 // path: Some(ConditionPath::Glob(rcstr!(
    //                 //     "**/node_modules/react-native/**"
    //                 // ))),
    //                 path: None,
    //                 content: Some(
    //                     EsRegex::new(
    //                         [
    //                             "'worklet'",
    //                             "\"worklet\"",
    //                             // https://github.com/software-mansion/react-native-reanimated/blob/ce9032c25e088e09bcce519963614cc5355beebb/packages/react-native-worklets/plugin/src/autoworkletization.ts#L16
    //                             "useAnimatedScrollHandler",
    //                             "react-native-gesture-handler",
    //                             "useFrameCallback",
    //                             "useAnimatedStyle",
    //                             "useAnimatedProps",
    //                             "createAnimatedPropAdapter",
    //                             "useDerivedValue",
    //                             "useAnimatedScrollHandler",
    //                             "useAnimatedReaction",
    //                             "withTiming",
    //                             "withSpring",
    //                             "withDecay",
    //                             "withRepeat",
    //                             "runOnUI",
    //                             "executeOnUIRuntimeSync",
    //                             "scheduleOnUI",
    //                             "runOnUISync",
    //                             "runOnUIAsync",
    //                             "runOnRuntime",
    //                             "scheduleOnRuntime",
    //                         ]
    //                         .join("|")
    //                         .as_str(),
    //                         "",
    //                     )?
    //                     .resolved_cell(),
    //                 ),
    //             }),
    //         },
    //     ));
    // }

    let loader_runner_package = Some(
        ImportMapping::Alternatives(vec![
            ImportMapping::External(
                Some(rcstr!("loader-runner")),
                ExternalType::CommonJs,
                ExternalTraced::Untraced,
            )
            .resolved_cell(),
        ])
        .resolved_cell(),
    );

    let enable_react_refresh = is_dev
        && assert_can_resolve_react_refresh(app_path.clone(), resolve_options_context)
            .await?
            .is_found();

    let enable_jsx = Some(
        JsxTransformOptions {
            development: is_dev,
            react_refresh: enable_react_refresh,
            ..Default::default()
        }
        .resolved_cell(),
    );

    let module_rules = vec![ModuleRule::new(
        RuleCondition::All(vec![
            // avoid urlAssetReference to be affected by this rule, since urlAssetReference
            // requires raw module to have its paths in the export
            RuleCondition::not(RuleCondition::ReferenceType(ReferenceType::Url(
                UrlReferenceSubType::Undefined,
            ))),
            RuleCondition::any(
                // https://github.com/facebook/metro/blob/8049cf009f9f754bf36bc06ec92a26bf51270f81/packages/metro-config/src/defaults/defaults.js#L16
                [
                    // Image formats
                    ".bmp", ".gif", ".jpg", ".jpeg", ".png", ".psd", ".svg", ".webp", ".xml",
                    // Video formats
                    ".m4v", ".mov", ".mp4", ".mpeg", ".mpg", ".webm", // Audio formats
                    ".aac", ".aiff", ".caf", ".m4a", ".mp3", ".wav",
                    // Document formats
                    ".html", ".pdf", ".yaml", ".yml", // Font formats
                    ".otf", ".ttf", // Archives (virtual files)
                    ".zip",
                ]
                .iter()
                .map(|ext| RuleCondition::ResourcePathEndsWith(ext.to_string()))
                .collect::<Vec<_>>(),
            ),
        ]),
        vec![ModuleRuleEffect::ModuleType(ModuleType::Custom(
            ResolvedVc::upcast(
                ReactNativeStructuredAssetModuleType::new()
                    .to_resolved()
                    .await?,
            ),
        ))],
    )];

    let module_options_context = ModuleOptionsContext {
        environment: Some(env),
        execution_context: Some(execution_context),
        tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
        keep_last_successful_parse: is_dev,
        module_rules,
        enable_webpack_loaders: Some(
            WebpackLoadersOptions {
                rules: ResolvedVc::cell(webpack_rules),
                builtin_conditions: EmptyWebpackLoaderBuiltinConditionSet::new()
                    .to_resolved()
                    .await?,
                loader_runner_package,
            }
            .resolved_cell(),
        ),
        ecmascript: EcmascriptOptionsContext {
            enable_jsx,
            // The ecosystem relies on Typescript in node_modules, e.g.
            // - node_modules/@expo/metro-runtime/src/index.ts
            // - node_modules/expo-haptics/src/Haptics.ts
            // - node_modules/expo-image/src/index.ts
            // - node_modules/expo-modules-core/src/index.ts
            // - node_modules/expo/src/Expo.ts
            // - node_modules/react-native-gesture-handler/lib/module/handlers/
            //   NativeViewGestureHandler.ts
            enable_typescript_transform: Some(
                TypescriptTransformOptions::default().resolved_cell(),
            ),
            ..Default::default()
        },
        ..Default::default()
    };

    let module_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            source_maps: source_maps_type,
            ..module_options_context.ecmascript.clone()
        },
        enable_postcss_transform: Some(PostCssTransformOptions::default().resolved_cell()),
        rules: vec![(
            foreign_code_context_condition(),
            module_options_context.clone().resolved_cell(),
        )],
        ..module_options_context
    }
    .cell();

    Ok(module_options_context)
}

#[turbo_tasks::function]
pub fn get_client_asset_context(
    project_path: FileSystemPath,
    app_path: FileSystemPath,
    execution_context: Vc<ExecutionContext>,
    compile_time_info: Vc<CompileTimeInfo>,
    node_env: Vc<NodeEnv>,
    source_maps_type: SourceMapsType,
    platform: Option<RcStr>,
) -> Vc<Box<dyn AssetContext>> {
    let resolve_options_context = get_client_resolve_options_context(
        project_path.clone(),
        app_path.clone(),
        node_env,
        platform.clone(),
    );
    let module_options_context = get_client_module_options_context(
        project_path,
        app_path,
        execution_context,
        compile_time_info.environment(),
        node_env,
        source_maps_type,
        platform,
    );

    let asset_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Default::default(),
        compile_time_info,
        module_options_context,
        resolve_options_context,
        Layer::new_with_user_friendly_name(rcstr!("rn"), rcstr!("React Native")),
    ));

    asset_context
}

fn client_defines(node_env: &NodeEnv, entry_filename: RcStr) -> CompileTimeDefines {
    compile_time_defines!(
        process.turbopack = true,
        process.env.TURBOPACK = true,
        process.env.NODE_ENV = node_env.to_string(),
        __DEV__ = *node_env == NodeEnv::Development,
        process.env.EXPO_OS = "ios",
        process.env.TURBOPACK_RN_ENTRY = entry_filename
    )
}

#[turbo_tasks::function]
pub async fn get_client_compile_time_info(
    browserslist_query: RcStr,
    node_env: Vc<NodeEnv>,
    entry_filename: RcStr,
) -> Result<Vc<CompileTimeInfo>> {
    let node_env = node_env.await?;

    let defines = client_defines(&node_env, entry_filename.clone());

    CompileTimeInfo::builder(
        Environment::new(ExecutionEnvironment::Browser(
            BrowserEnvironment {
                dom: true,
                web_worker: false,
                service_worker: false,
                browserslist_query,
            }
            .resolved_cell(),
        ))
        .to_resolved()
        .await?,
    )
    .defines(defines.clone().resolved_cell())
    .free_var_references(free_var_references!(..defines.into_iter()).resolved_cell())
    .cell()
    .await
}
