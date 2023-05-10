use anyhow::Result;
use turbo_binding::{
    turbo::tasks_fs::{FileJsonContentVc, FileSystemPathVc},
    turbopack::{
        core::{
            asset::AssetVc,
            resolve::{find_context_file, node::node_cjs_resolve_options, FindContextFileResult},
            source_asset::SourceAssetVc,
        },
        ecmascript::typescript::resolve::{read_from_tsconfigs, read_tsconfigs, tsconfig},
        ecmascript_plugin::transform::emotion::{
            EmotionTransformConfig, EmotionTransformConfigVc, OptionEmotionTransformConfigVc,
        },
        turbopack::module_options::{
            DecoratorsKind, DecoratorsOptions, DecoratorsOptionsVc, JsxTransformOptions,
            JsxTransformOptionsVc, OptionStyledComponentsTransformConfigVc,
            StyledComponentsTransformConfig, TypescriptTransformOptions,
            TypescriptTransformOptionsVc,
        },
    },
};

use crate::next_config::{
    EmotionTransformOptionsOrBoolean, NextConfigVc, StyledComponentsTransformOptionsOrBoolean,
};

async fn get_typescript_options(
    project_path: FileSystemPathVc,
) -> Option<Vec<(FileJsonContentVc, AssetVc)>> {
    let tsconfig = find_context_file(project_path, tsconfig());
    match *tsconfig.await.ok()? {
        FindContextFileResult::Found(path, _) => Some(
            read_tsconfigs(
                path.read(),
                SourceAssetVc::new(path).into(),
                node_cjs_resolve_options(path.root()),
            )
            .await
            .ok()?,
        ),
        FindContextFileResult::NotFound(_) => None,
    }
}

/// Build the transform options for specifically for the typescript's runtime
/// outputs
#[turbo_tasks::function]
pub async fn get_typescript_transform_options(
    project_path: FileSystemPathVc,
) -> Result<TypescriptTransformOptionsVc> {
    let tsconfig = get_typescript_options(project_path).await;

    let use_define_for_class_fields = if let Some(tsconfig) = tsconfig {
        read_from_tsconfigs(&tsconfig, |json, _| {
            json["compilerOptions"]["useDefineForClassFields"].as_bool()
        })
        .await?
        .unwrap_or(false)
    } else {
        false
    };

    let ts_transform_options = TypescriptTransformOptions {
        use_define_for_class_fields,
    };

    Ok(ts_transform_options.cell())
}

/// Build the transform options for the decorators.
/// [TODO]: Currnently only typescript's legacy decorators are supported
#[turbo_tasks::function]
pub async fn get_decorators_transform_options(
    project_path: FileSystemPathVc,
) -> Result<DecoratorsOptionsVc> {
    let tsconfig = get_typescript_options(project_path).await;

    let decorators_transform_options = if let Some(tsconfig) = tsconfig {
        read_from_tsconfigs(&tsconfig, |json, _| {
            let decorators_kind = if json["compilerOptions"]["experimentalDecorators"]
                .as_bool()
                .unwrap_or(false)
            {
                Some(DecoratorsKind::Legacy)
            } else {
                // ref: https://devblogs.microsoft.com/typescript/announcing-typescript-5-0-rc/#differences-with-experimental-legacy-decorators
                // `without the flag, decorators will now be valid syntax for all new code.
                // Outside of --experimentalDecorators, they will be type-checked and emitted
                // differently with ts 5.0, new ecma decorators will be enabled
                // if legacy decorators are not enabled
                Some(DecoratorsKind::Ecma)
            };

            let emit_decorators_metadata = if let Some(decorators_kind) = &decorators_kind {
                match decorators_kind {
                    DecoratorsKind::Legacy => {
                        // ref: This new decorators proposal is not compatible with
                        // --emitDecoratorMetadata, and it does not allow decorating parameters.
                        // Future ECMAScript proposals may be able to help bridge that gap
                        json["compilerOptions"]["emitDecoratorMetadata"]
                            .as_bool()
                            .unwrap_or(false)
                    }
                    DecoratorsKind::Ecma => false,
                }
            } else {
                false
            };

            Some(DecoratorsOptions {
                decorators_kind,
                emit_decorators_metadata,
                use_define_for_class_fields: json["compilerOptions"]["useDefineForClassFields"]
                    .as_bool()
                    .unwrap_or(false),
                ..Default::default()
            })
        })
        .await?
        .unwrap_or_default()
    } else {
        Default::default()
    };

    Ok(decorators_transform_options.cell())
}

#[turbo_tasks::function]
pub async fn get_jsx_transform_options(
    project_path: FileSystemPathVc,
) -> Result<JsxTransformOptionsVc> {
    let tsconfig = get_typescript_options(project_path).await;

    // [NOTE]: ref: WEB-901
    // next.js does not allow to overriding react runtime config via tsconfig /
    // jsconfig, it forces overrides into automatic runtime instead.
    // [TODO]: we need to emit / validate config message like next.js devserver does
    let react_transform_options = JsxTransformOptions {
        import_source: None,
        runtime: Some("automatic".to_string()),
    };

    let react_transform_options = if let Some(tsconfig) = tsconfig {
        read_from_tsconfigs(&tsconfig, |json, _| {
            let jsx_import_source = json["compilerOptions"]["jsxImportSource"]
                .as_str()
                .map(|s| s.to_string());

            Some(JsxTransformOptions {
                import_source: jsx_import_source,
                ..react_transform_options.clone()
            })
        })
        .await?
        .unwrap_or_default()
    } else {
        react_transform_options
    };

    Ok(react_transform_options.cell())
}

#[turbo_tasks::function]
pub async fn get_emotion_compiler_config(
    next_config: NextConfigVc,
) -> Result<OptionEmotionTransformConfigVc> {
    let emotion_compiler_config = next_config
        .await?
        .compiler
        .as_ref()
        .map(|value| {
            value
                .emotion
                .as_ref()
                .map(|value| {
                    let options = match value {
                        EmotionTransformOptionsOrBoolean::Boolean(true) => {
                            Some(EmotionTransformConfigVc::cell(EmotionTransformConfig {
                                ..Default::default()
                            }))
                        }
                        EmotionTransformOptionsOrBoolean::Boolean(false) => None,
                        EmotionTransformOptionsOrBoolean::Options(value) => {
                            Some(EmotionTransformConfigVc::cell(value.clone()))
                        }
                    };

                    OptionEmotionTransformConfigVc::cell(options)
                })
                .unwrap_or_else(|| OptionEmotionTransformConfigVc::cell(None))
        })
        .unwrap_or_else(|| OptionEmotionTransformConfigVc::cell(None));

    Ok(emotion_compiler_config)
}

#[turbo_tasks::function]
pub async fn get_styled_components_compiler_config(
    next_config: NextConfigVc,
) -> Result<OptionStyledComponentsTransformConfigVc> {
    let styled_components_compiler_config = next_config
        .await?
        .compiler
        .as_ref()
        .map(|value| {
            value
                .styled_components
                .as_ref()
                .map(|value| {
                    let options = match value {
                        StyledComponentsTransformOptionsOrBoolean::Boolean(true) => Some(
                            StyledComponentsTransformConfig {
                                ..Default::default()
                            }
                            .cell(),
                        ),
                        StyledComponentsTransformOptionsOrBoolean::Boolean(false) => None,
                        StyledComponentsTransformOptionsOrBoolean::Options(value) => {
                            Some(value.clone().cell())
                        }
                    };

                    OptionStyledComponentsTransformConfigVc::cell(options)
                })
                .unwrap_or_else(|| OptionStyledComponentsTransformConfigVc::cell(None))
        })
        .unwrap_or_else(|| OptionStyledComponentsTransformConfigVc::cell(None));

    Ok(styled_components_compiler_config)
}
