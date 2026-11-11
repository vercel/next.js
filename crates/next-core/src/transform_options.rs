use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{self, FileJsonContent, FileSystemPath};
use turbopack::module_options::{
    DecoratorsKind, DecoratorsOptions, JsxTransformOptions, TypescriptTransformOptions,
};
use turbopack_browser::react_refresh::assert_can_resolve_react_refresh;
use turbopack_core::{
    file_source::FileSource,
    resolve::{
        FindContextFileResult, find_context_file, find_context_file_with_native_tsconfig_probes,
        node::node_cjs_resolve_options,
        tsconfig_provenance::{NativeTsConfigProbe, NativeTsConfigProbeScope},
    },
    source::Source,
};
use turbopack_ecmascript::typescript::resolve::{
    read_from_tsconfigs, read_tsconfigs, read_tsconfigs_with_native_provenance, tsconfig,
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::{mode::NextMode, next_config::NextConfig};

async fn get_typescript_options(
    project_path: FileSystemPath,
    tsconfig_path: Option<FileSystemPath>,
    native_probe: Option<NativeTsConfigProbeScope>,
) -> Result<Option<Vec<(Vc<FileJsonContent>, ResolvedVc<Box<dyn Source>>)>>> {
    let selected = if let Some(path) = tsconfig_path {
        Some(path)
    } else {
        let found = if let Some(scope) = &native_probe {
            find_context_file_with_native_tsconfig_probes(
                project_path.clone(),
                tsconfig(),
                false,
                Some(scope.clone()),
            )
        } else {
            find_context_file(project_path.clone(), tsconfig(), false)
        };
        match found.await.ok().as_deref() {
            Some(FindContextFileResult::Found(path, _)) => Some(path.clone()),
            Some(FindContextFileResult::NotFound(_)) => None,
            None => {
                if let Some(scope) = &native_probe {
                    scope.record(NativeTsConfigProbe::Incomplete {
                        path: project_path.clone(),
                        reason: "native transform config discovery failed".into(),
                    });
                }
                None
            }
        }
    };
    if let Some(scope) = &native_probe {
        scope.record(NativeTsConfigProbe::Selection {
            path: project_path,
            selected: selected.clone(),
        });
    }
    let Some(path) = selected else {
        return Ok(None);
    };
    let source = ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?);
    let read = if let Some(scope) = &native_probe {
        read_tsconfigs_with_native_provenance(
            path.read(),
            source,
            node_cjs_resolve_options(),
            scope.clone(),
        )
        .await
    } else {
        read_tsconfigs(path.read(), source, node_cjs_resolve_options()).await
    };
    if read.is_err() {
        if let Some(scope) = &native_probe {
            scope.record(NativeTsConfigProbe::Incomplete {
                path,
                reason: "native transform config read failed".into(),
            });
        }
    }
    Ok(read.ok())
}

/// Build the transform options for specifically for the typescript's runtime
/// outputs
#[turbo_tasks::function]
pub async fn get_typescript_transform_options(
    project_path: FileSystemPath,
    tsconfig_path: Option<FileSystemPath>,
) -> Result<Vc<TypescriptTransformOptions>> {
    get_typescript_transform_options_impl(project_path, tsconfig_path, None).await
}

#[turbo_tasks::function]
pub async fn get_typescript_transform_options_with_native_provenance(
    project_path: FileSystemPath,
    tsconfig_path: Option<FileSystemPath>,
    native_probe: NativeTsConfigProbeScope,
) -> Result<Vc<TypescriptTransformOptions>> {
    get_typescript_transform_options_impl(project_path, tsconfig_path, Some(native_probe)).await
}

async fn get_typescript_transform_options_impl(
    project_path: FileSystemPath,
    tsconfig_path: Option<FileSystemPath>,
    native_probe: Option<NativeTsConfigProbeScope>,
) -> Result<Vc<TypescriptTransformOptions>> {
    let tsconfig = get_typescript_options(project_path, tsconfig_path, native_probe).await?;

    let use_define_for_class_fields = if let Some(ref tsconfig) = tsconfig {
        read_from_tsconfigs(tsconfig, |json, _| {
            json.get("compilerOptions")
                .and_then(|opts| opts.get("useDefineForClassFields"))
                .and_then(|v| v.as_bool())
        })
        .await?
        .unwrap_or(false)
    } else {
        false
    };

    let verbatim_module_syntax = if let Some(ref tsconfig) = tsconfig {
        read_from_tsconfigs(tsconfig, |json, _| {
            json.get("compilerOptions")
                .and_then(|opts| opts.get("verbatimModuleSyntax"))
                .and_then(|v| v.as_bool())
        })
        .await?
        .unwrap_or(false)
    } else {
        false
    };

    let ts_transform_options = TypescriptTransformOptions {
        use_define_for_class_fields,
        verbatim_module_syntax,
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
    get_decorators_transform_options_impl(project_path, tsconfig_path, None).await
}

#[turbo_tasks::function]
pub async fn get_decorators_transform_options_with_native_provenance(
    project_path: FileSystemPath,
    tsconfig_path: Option<FileSystemPath>,
    native_probe: NativeTsConfigProbeScope,
) -> Result<Vc<DecoratorsOptions>> {
    get_decorators_transform_options_impl(project_path, tsconfig_path, Some(native_probe)).await
}

async fn get_decorators_transform_options_impl(
    project_path: FileSystemPath,
    tsconfig_path: Option<FileSystemPath>,
    native_probe: Option<NativeTsConfigProbeScope>,
) -> Result<Vc<DecoratorsOptions>> {
    let tsconfig = get_typescript_options(project_path, tsconfig_path, native_probe).await?;

    let experimental_decorators = if let Some(ref tsconfig) = tsconfig {
        read_from_tsconfigs(tsconfig, |json, _| {
            json.get("compilerOptions")
                .and_then(|opts| opts.get("experimentalDecorators"))
                .and_then(|v| v.as_bool())
        })
        .await?
        .unwrap_or(false)
    } else {
        false
    };

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

    let emit_decorators_metadata = if let Some(ref tsconfig) = tsconfig {
        read_from_tsconfigs(tsconfig, |json, _| {
            json.get("compilerOptions")
                .and_then(|opts| opts.get("emitDecoratorMetadata"))
                .and_then(|v| v.as_bool())
        })
        .await?
        .unwrap_or(false)
    } else {
        false
    };

    let use_define_for_class_fields = if let Some(ref tsconfig) = tsconfig {
        read_from_tsconfigs(tsconfig, |json, _| {
            json.get("compilerOptions")
                .and_then(|opts| opts.get("useDefineForClassFields"))
                .and_then(|v| v.as_bool())
        })
        .await?
        .unwrap_or(false)
    } else {
        false
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
    get_jsx_transform_options_impl(
        project_path,
        mode,
        resolve_options_context,
        is_rsc_context,
        next_config,
        tsconfig_path,
        None,
    )
    .await
}

#[turbo_tasks::function]
pub async fn get_jsx_transform_options_with_native_provenance(
    project_path: FileSystemPath,
    mode: Vc<NextMode>,
    resolve_options_context: Option<Vc<ResolveOptionsContext>>,
    is_rsc_context: bool,
    next_config: Vc<NextConfig>,
    tsconfig_path: Option<FileSystemPath>,
    native_probe: NativeTsConfigProbeScope,
) -> Result<Vc<JsxTransformOptions>> {
    get_jsx_transform_options_impl(
        project_path,
        mode,
        resolve_options_context,
        is_rsc_context,
        next_config,
        tsconfig_path,
        Some(native_probe),
    )
    .await
}

async fn get_jsx_transform_options_impl(
    project_path: FileSystemPath,
    mode: Vc<NextMode>,
    resolve_options_context: Option<Vc<ResolveOptionsContext>>,
    is_rsc_context: bool,
    next_config: Vc<NextConfig>,
    tsconfig_path: Option<FileSystemPath>,
    native_probe: Option<NativeTsConfigProbeScope>,
) -> Result<Vc<JsxTransformOptions>> {
    let tsconfig =
        get_typescript_options(project_path.clone(), tsconfig_path, native_probe).await?;

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

    let jsx_import_source = if let Some(tsconfig) = tsconfig {
        read_from_tsconfigs(&tsconfig, |json, _| {
            json.get("compilerOptions")
                .and_then(|opts| opts.get("jsxImportSource"))
                .and_then(|v| v.as_str())
                .map(|s| s.into())
        })
        .await?
    } else {
        None
    };
    let react_transform_options = JsxTransformOptions {
        import_source: jsx_import_source.or(react_transform_options.import_source),
        ..react_transform_options
    };

    Ok(react_transform_options.cell())
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use serde_json::json;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{TurboTasks, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, FileSystem};
    use turbopack::module_options::JsxTransformOptions;

    use crate::{
        mode::NextMode, next_config::NextConfig, transform_options::get_jsx_transform_options,
    };

    #[turbo_tasks::function(operation, root)]
    async fn read_jsx_options(
        root: RcStr,
        mode: NextMode,
        selected: bool,
        is_rsc_context: bool,
        serialized_config: RcStr,
    ) -> Result<Vc<JsxTransformOptions>> {
        let filesystem = DiskFileSystem::new(rcstr!("jsx-import-source"), Vc::cell(root));
        let project_path = filesystem.root().owned().await?;
        let selected = selected
            .then(|| project_path.join("tsconfig.custom.json"))
            .transpose()?;
        let options = get_jsx_transform_options(
            project_path,
            mode.cell(),
            None,
            is_rsc_context,
            NextConfig::from_string(Vc::cell(serialized_config)),
            selected,
        );
        options.await?;
        Ok(options)
    }

    async fn jsx_options(
        configs: &[(&str, &str)],
        mode: NextMode,
        emotion_enabled: bool,
        is_rsc_context: bool,
    ) -> Result<JsxTransformOptions> {
        let directory = tempfile::tempdir()?;
        let root = directory.path().canonicalize()?;
        for (file, contents) in configs {
            std::fs::write(root.join(file), contents)?;
        }
        let selected = configs
            .iter()
            .any(|(file, _)| *file == "tsconfig.custom.json");
        let root = root.to_str().unwrap().to_owned();
        let serialized_config = if emotion_enabled {
            json!({ "compiler": { "emotion": true } })
        } else {
            json!({})
        }
        .to_string();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move {
                let options = read_jsx_options(
                    root.into(),
                    mode,
                    selected,
                    is_rsc_context,
                    serialized_config.into(),
                )
                .read_strongly_consistent()
                .await?;
                Ok((*options).clone())
            })
            .await
    }

    fn assert_options(options: &JsxTransformOptions, mode: NextMode, import_source: Option<&str>) {
        assert_eq!(options.import_source.as_deref(), import_source);
        assert_eq!(options.runtime.as_deref(), Some("automatic"));
        assert_eq!(options.development, mode.is_react_development());
        assert!(!options.react_refresh);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn jsx_import_source_uses_inherited_value() -> Result<()> {
        let configs = [
            ("tsconfig.custom.json", r#"{"extends":"./middle.json"}"#),
            (
                "middle.json",
                r#"{"extends":"./base.json","compilerOptions":{"jsx":"react-jsx"}}"#,
            ),
            (
                "base.json",
                r#"{"compilerOptions":{"jsxImportSource":"base-runtime"}}"#,
            ),
        ];
        for mode in [NextMode::Development, NextMode::Build] {
            for emotion_enabled in [false, true] {
                for is_rsc_context in [false, true] {
                    let options =
                        jsx_options(&configs, mode, emotion_enabled, is_rsc_context).await?;
                    assert_options(&options, mode, Some("base-runtime"));
                }
            }
        }
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn jsx_import_source_child_override_wins() -> Result<()> {
        let configs = [
            (
                "tsconfig.custom.json",
                r#"{"extends":"./base.json","compilerOptions":{"jsxImportSource":"child-runtime"}}"#,
            ),
            (
                "base.json",
                r#"{"compilerOptions":{"jsxImportSource":"base-runtime"}}"#,
            ),
        ];
        for mode in [NextMode::Development, NextMode::Build] {
            for emotion_enabled in [false, true] {
                for is_rsc_context in [false, true] {
                    let options =
                        jsx_options(&configs, mode, emotion_enabled, is_rsc_context).await?;
                    assert_options(&options, mode, Some("child-runtime"));
                }
            }
        }
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn jsx_import_source_missing_value_preserves_fallback() -> Result<()> {
        let configs = [
            ("tsconfig.custom.json", r#"{"extends":"./base.json"}"#),
            ("base.json", r#"{"compilerOptions":{"jsx":"react"}}"#),
        ];
        for mode in [NextMode::Development, NextMode::Build] {
            for emotion_enabled in [false, true] {
                for is_rsc_context in [false, true] {
                    let options =
                        jsx_options(&configs, mode, emotion_enabled, is_rsc_context).await?;
                    let expected = (emotion_enabled && !is_rsc_context).then_some("@emotion/react");
                    assert_options(&options, mode, expected);
                }
            }
        }
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn jsx_import_source_no_config_preserves_fallback() -> Result<()> {
        for mode in [NextMode::Development, NextMode::Build] {
            for emotion_enabled in [false, true] {
                for is_rsc_context in [false, true] {
                    let options = jsx_options(&[], mode, emotion_enabled, is_rsc_context).await?;
                    let expected = (emotion_enabled && !is_rsc_context).then_some("@emotion/react");
                    assert_options(&options, mode, expected);
                }
            }
        }
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn jsx_import_source_non_string_value_keeps_searching() -> Result<()> {
        for value in ["null", "false", "42", "{}", "[]"] {
            let child = format!(
                r#"{{"extends":"./base.json","compilerOptions":{{"jsxImportSource":{value}}}}}"#
            );
            let options = jsx_options(
                &[
                    ("tsconfig.custom.json", &child),
                    (
                        "base.json",
                        r#"{"compilerOptions":{"jsxImportSource":"base-runtime"}}"#,
                    ),
                ],
                NextMode::Development,
                true,
                false,
            )
            .await?;
            assert_options(&options, NextMode::Development, Some("base-runtime"));
        }
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn jsx_import_source_empty_string_is_an_explicit_override() -> Result<()> {
        let options = jsx_options(
            &[
                (
                    "tsconfig.custom.json",
                    r#"{"extends":"./base.json","compilerOptions":{"jsxImportSource":""}}"#,
                ),
                (
                    "base.json",
                    r#"{"compilerOptions":{"jsxImportSource":"base-runtime"}}"#,
                ),
            ],
            NextMode::Development,
            true,
            false,
        )
        .await?;
        assert_options(&options, NextMode::Development, Some(""));
        Ok(())
    }
}
