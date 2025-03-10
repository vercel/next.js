use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{self, FileJsonContent, FileSystemPath};
use turbopack::{
    module_options::{
        DecoratorsKind, DecoratorsOptions, JsxTransformOptions, TypescriptTransformOptions,
    },
    resolve_options_context::ResolveOptionsContext,
};
use turbopack_browser::react_refresh::assert_can_resolve_react_refresh;
use turbopack_core::{
    file_source::FileSource,
    resolve::{find_context_file, node::node_cjs_resolve_options, FindContextFileResult},
    source::Source,
};
use turbopack_ecmascript::typescript::resolve::{read_from_tsconfigs, read_tsconfigs, tsconfig};

use crate::{mode::NextMode, next_config::NextConfig};

async fn get_typescript_options(
    project_path: Vc<FileSystemPath>,
) -> Result<Option<Vec<(Vc<FileJsonContent>, ResolvedVc<Box<dyn Source>>)>>> {
    let tsconfig = find_context_file(project_path, tsconfig());
    Ok(match tsconfig.await.ok().as_deref() {
        Some(FindContextFileResult::Found(path, _)) => read_tsconfigs(
            path.read(),
            ResolvedVc::upcast(FileSource::new(**path).to_resolved().await?),
            node_cjs_resolve_options(path.root()),
        )
        .await
        .ok(),
        Some(FindContextFileResult::NotFound(_)) | None => None,
    })
}

/// Build the transform options for specifically for the typescript's runtime
/// outputs
#[turbo_tasks::function]
pub async fn get_typescript_transform_options(
    project_path: Vc<FileSystemPath>,
) -> Result<Vc<TypescriptTransformOptions>> {
    let tsconfig = get_typescript_options(project_path).await?;

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
/// **TODO** Currnently only typescript's legacy decorators are supported
#[turbo_tasks::function]
pub async fn get_decorators_transform_options(
    project_path: Vc<FileSystemPath>,
) -> Result<Vc<DecoratorsOptions>> {
    let tsconfig = get_typescript_options(project_path).await?;

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
    project_path: Vc<FileSystemPath>,
    mode: Vc<NextMode>,
    resolve_options_context: Option<Vc<ResolveOptionsContext>>,
    is_rsc_context: bool,
    next_config: Vc<NextConfig>,
) -> Result<Vc<JsxTransformOptions>> {
    let tsconfig = get_typescript_options(project_path).await?;

    let is_react_development = mode.await?.is_react_development();
    let enable_react_refresh = if is_react_development {
        if let Some(resolve_options_context) = resolve_options_context {
            assert_can_resolve_react_refresh(project_path, resolve_options_context)
                .await?
                .is_found()
        } else {
            false
        }
    } else {
        false
    };

    let is_emotion_enabled = next_config.compiler().await?.emotion.is_some();

    // [NOTE]: ref: WEB-901
    // next.js does not allow to overriding react runtime config via tsconfig /
    // jsconfig, it forces overrides into automatic runtime instead.
    // [TODO]: we need to emit / validate config message like next.js devserver does
    let react_transform_options = JsxTransformOptions {
        development: mode.await?.is_react_development(),
        // https://github.com/vercel/next.js/blob/3dc2c1c7f8441cdee31da9f7e0986d654c7fd2e7/packages/next/src/build/swc/options.ts#L112
        // This'll be ignored if ts|jsconfig explicitly specifies importSource
        import_source: if is_emotion_enabled && !is_rsc_context {
            Some("@emotion/react".into())
        } else {
            None
        },
        runtime: Some("automatic".into()),
        react_refresh: enable_react_refresh,
    };

    let react_transform_options = if let Some(tsconfig) = tsconfig {
        read_from_tsconfigs(&tsconfig, |json, _| {
            let jsx_import_source = json["compilerOptions"]["jsxImportSource"]
                .as_str()
                .map(|s| s.into());

            Some(JsxTransformOptions {
                import_source: if jsx_import_source.is_some() {
                    jsx_import_source
                } else {
                    react_transform_options.import_source.clone()
                },
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
