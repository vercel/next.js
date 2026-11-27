use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{self, FileJsonContent, FileSystemPath};
use turbopack::module_options::{
    DecoratorsKind, DecoratorsOptions, JsxTransformOptions, TypescriptTransformOptions,
};
use turbopack_browser::react_refresh::assert_can_resolve_react_refresh;
use turbopack_core::{
    file_source::FileSource,
    resolve::{FindContextFileResult, find_context_file, node::node_cjs_resolve_options},
    source::Source,
};
use turbopack_ecmascript::typescript::resolve::{read_from_tsconfigs, read_tsconfigs, tsconfig};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::{mode::NextMode, next_config::NextConfig};

async fn get_typescript_options(
    project_path: FileSystemPath,
    tsconfig_path: Option<FileSystemPath>,
) -> Result<Option<Vec<(Vc<FileJsonContent>, ResolvedVc<Box<dyn Source>>)>>> {
    if let Some(tsconfig_path) = tsconfig_path {
        let tsconfigs = read_tsconfigs(
            tsconfig_path.read(),
            ResolvedVc::upcast(FileSource::new(tsconfig_path.clone()).to_resolved().await?),
            node_cjs_resolve_options(),
        )
        .await
        .ok();

        Ok(tsconfigs)
    } else {
        let tsconfig = find_context_file(project_path, tsconfig(), false);
        Ok(match tsconfig.await.ok().as_deref() {
            Some(FindContextFileResult::Found(path, _)) => read_tsconfigs(
                path.read(),
                ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?),
                node_cjs_resolve_options(),
            )
            .await
            .ok(),
            Some(FindContextFileResult::NotFound(_)) | None => None,
        })
    }
}

/// The `compilerOptions` of the tsconfig that the transforms read. As in TypeScript, each option is
/// taken from the nearest config in the `extends` chain that sets it.
#[turbo_tasks::value]
#[derive(Default)]
struct TsConfigCompilerOptions {
    use_define_for_class_fields: Option<bool>,
    verbatim_module_syntax: Option<bool>,
    experimental_decorators: Option<bool>,
    emit_decorator_metadata: Option<bool>,
    jsx_import_source: Option<RcStr>,
}

#[turbo_tasks::function]
async fn tsconfig_compiler_options(
    project_path: FileSystemPath,
    tsconfig_path: Option<FileSystemPath>,
) -> Result<Vc<TsConfigCompilerOptions>> {
    let Some(tsconfig) = get_typescript_options(project_path, tsconfig_path).await? else {
        return Ok(TsConfigCompilerOptions::default().cell());
    };
    let bool_option = async |name: &str| {
        read_from_tsconfigs(&tsconfig, |json, _| {
            json.get("compilerOptions")
                .and_then(|options| options.get(name))
                .and_then(|value| value.as_bool())
        })
        .await
    };
    Ok(TsConfigCompilerOptions {
        use_define_for_class_fields: bool_option("useDefineForClassFields").await?,
        verbatim_module_syntax: bool_option("verbatimModuleSyntax").await?,
        experimental_decorators: bool_option("experimentalDecorators").await?,
        emit_decorator_metadata: bool_option("emitDecoratorMetadata").await?,
        jsx_import_source: read_from_tsconfigs(&tsconfig, |json, _| {
            json.get("compilerOptions")
                .and_then(|options| options.get("jsxImportSource"))
                .and_then(|value| value.as_str())
                .map(RcStr::from)
        })
        .await?,
    }
    .cell())
}

/// Build the transform options for specifically for the typescript's runtime
/// outputs
#[turbo_tasks::function]
pub async fn get_typescript_transform_options(
    project_path: FileSystemPath,
    tsconfig_path: Option<FileSystemPath>,
) -> Result<Vc<TypescriptTransformOptions>> {
    let options = tsconfig_compiler_options(project_path, tsconfig_path).await?;

    let ts_transform_options = TypescriptTransformOptions {
        use_define_for_class_fields: options.use_define_for_class_fields.unwrap_or(false),
        verbatim_module_syntax: options.verbatim_module_syntax.unwrap_or(false),
    };

    Ok(ts_transform_options.cell())
}

/// Build the transform options for the decorators.
/// **TODO** Currently only typescript's legacy decorators are supported
#[turbo_tasks::function]
pub async fn get_decorators_transform_options(
    project_path: FileSystemPath,
    tsconfig_path: Option<FileSystemPath>,
) -> Result<Vc<DecoratorsOptions>> {
    let options = tsconfig_compiler_options(project_path, tsconfig_path).await?;
    let experimental_decorators = options.experimental_decorators.unwrap_or(false);
    let emit_decorators_metadata = options.emit_decorator_metadata.unwrap_or(false);
    let use_define_for_class_fields = options.use_define_for_class_fields.unwrap_or(false);

    let decorators_kind = if experimental_decorators {
        Some(DecoratorsKind::Legacy)
    } else {
        // ref: https://devblogs.microsoft.com/typescript/announcing-typescript-5-0-rc/#differences-with-experimental-legacy-decorators
        // `without the flag, decorators will now be valid syntax for all new code.
        // Outside of --experimentalDecorators, they will be type-checked and emitted
        // differently with ts 5.0, new ecma decorators will be enabled
        // if legacy decorators are not enabled
        Some(DecoratorsKind::Ecma)
    };

    let decorators_transform_options = DecoratorsOptions {
        decorators_kind: decorators_kind.clone(),
        emit_decorators_metadata: if let Some(ref decorators_kind) = decorators_kind {
            match decorators_kind {
                DecoratorsKind::Legacy => emit_decorators_metadata,
                // ref: This new decorators proposal is not compatible with
                // --emitDecoratorMetadata, and it does not allow decorating parameters.
                // Future ECMAScript proposals may be able to help bridge that gap
                DecoratorsKind::Ecma => false,
            }
        } else {
            false
        },
        use_define_for_class_fields,
        ..Default::default()
    };

    Ok(decorators_transform_options.cell())
}

#[turbo_tasks::function]
pub async fn get_jsx_transform_options(
    project_path: FileSystemPath,
    mode: Vc<NextMode>,
    resolve_options_context: Option<Vc<ResolveOptionsContext>>,
    is_rsc_context: bool,
    next_config: Vc<NextConfig>,
    tsconfig_path: Option<FileSystemPath>,
) -> Result<Vc<JsxTransformOptions>> {
    let is_react_development = mode.await?.is_react_development();
    let enable_react_refresh = if is_react_development {
        if let Some(resolve_options_context) = resolve_options_context {
            assert_can_resolve_react_refresh(project_path.clone(), resolve_options_context)
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
            Some(rcstr!("@emotion/react"))
        } else {
            None
        },
        runtime: Some(rcstr!("automatic")),
        react_refresh: enable_react_refresh,
    };

    // An explicit `jsxImportSource` in the tsconfig wins over the default.
    let jsx_import_source = tsconfig_compiler_options(project_path, tsconfig_path)
        .await?
        .jsx_import_source
        .clone();
    let react_transform_options = JsxTransformOptions {
        import_source: jsx_import_source.or(react_transform_options.import_source),
        ..react_transform_options
    };

    Ok(react_transform_options.cell())
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::Vc;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, FileSystem};

    use super::{TsConfigCompilerOptions, tsconfig_compiler_options};

    /// Compiler options are inherited through `extends`, as in TypeScript. `jsxImportSource` used
    /// to be read from the first config only, so an inherited one was ignored.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_compiler_options_from_extended_tsconfig() {
        let scratch = tempfile::tempdir().unwrap();
        // The disk filesystem rejects paths behind a symlink, like the macOS temp dir.
        let root = scratch.path().canonicalize().unwrap();
        std::fs::write(
            root.join("tsconfig.base.json"),
            r#"{ "compilerOptions": { "jsxImportSource": "@emotion/react", "experimentalDecorators": true } }"#,
        )
        .unwrap();
        std::fs::write(
            root.join("tsconfig.json"),
            r#"{ "extends": "./tsconfig.base.json", "compilerOptions": { "experimentalDecorators": false } }"#,
        )
        .unwrap();
        let root: RcStr = root.to_str().unwrap().into();

        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            #[turbo_tasks::function(operation, root)]
            async fn compiler_options_operation(
                root: RcStr,
            ) -> anyhow::Result<Vc<TsConfigCompilerOptions>> {
                let fs = DiskFileSystem::new(rcstr!("test"), Vc::cell(root));
                let project_path = fs.root().owned().await?;
                Ok(tsconfig_compiler_options(project_path, None))
            }

            let options = compiler_options_operation(root)
                .read_strongly_consistent()
                .await?;
            // Inherited from the base config.
            assert_eq!(options.jsx_import_source, Some(rcstr!("@emotion/react")));
            // Set in both, the nearest config wins.
            assert_eq!(options.experimental_decorators, Some(false));
            // Set in neither.
            assert_eq!(options.use_define_for_class_fields, None);
            Ok(())
        })
        .await
        .unwrap();
    }
}
