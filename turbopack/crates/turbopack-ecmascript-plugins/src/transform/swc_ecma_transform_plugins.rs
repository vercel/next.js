use anyhow::Result;
use async_trait::async_trait;
use swc_core::ecma::ast::Program;
use turbo_rcstr::rcstr;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, OptionStyledString, StyledString};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

/// A wrapper around an SWC's ecma transform wasm plugin module bytes, allowing
/// it to operate with the turbo_tasks caching requirements.
///
/// Internally this contains a `CompiledPluginModuleBytes`, which points to the
/// compiled, serialized wasmer::Module instead of raw file bytes to reduce the
/// cost of the compilation.
#[turbo_tasks::value(serialization = "none", eq = "manual", into = "new", cell = "new")]
pub struct SwcPluginModule(
    #[turbo_tasks(trace_ignore, debug_ignore)]
    #[cfg(feature = "swc_ecma_transform_plugin")]
    pub swc_core::plugin_runner::plugin_module_bytes::CompiledPluginModuleBytes,
    // Dummy field to avoid turbo_tasks macro complaining about empty struct.
    // This is because we can't import CompiledPluginModuleBytes by default, it should be only
    // available for the target / platforms that support swc plugins (which can build wasmer)
    #[cfg(not(feature = "swc_ecma_transform_plugin"))] pub (),
);

impl SwcPluginModule {
    pub fn new(plugin_name: &str, plugin_bytes: Vec<u8>) -> Self {
        #[cfg(feature = "swc_ecma_transform_plugin")]
        {
            use swc_core::plugin_runner::plugin_module_bytes::{
                CompiledPluginModuleBytes, RawPluginModuleBytes,
            };
            use swc_plugin_backend_wasmer::WasmerRuntime;

            Self(CompiledPluginModuleBytes::from_raw_module(
                &WasmerRuntime,
                RawPluginModuleBytes::new(plugin_name.to_string(), plugin_bytes),
            ))
        }

        #[cfg(not(feature = "swc_ecma_transform_plugin"))]
        {
            let _ = plugin_name;
            let _ = plugin_bytes;
            Self(())
        }
    }
}

#[turbo_tasks::value(shared)]
struct UnsupportedSwcEcmaTransformPluginsIssue {
    pub file_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedSwcEcmaTransformPluginsIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.cell()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!(
            "Unsupported SWC EcmaScript transform plugins on this platform."
        ))
        .cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.file_path.clone().cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(rcstr!(
                "Turbopack does not yet support running SWC EcmaScript transform plugins on this \
                 platform."
            ))
            .resolved_cell(),
        ))
    }
}

/// A custom transformer plugin to execute SWC's transform plugins.
#[derive(Debug)]
pub struct SwcEcmaTransformPluginsTransformer {
    #[cfg(feature = "swc_ecma_transform_plugin")]
    plugins: Vec<(turbo_tasks::ResolvedVc<SwcPluginModule>, serde_json::Value)>,
}

impl SwcEcmaTransformPluginsTransformer {
    #[cfg(feature = "swc_ecma_transform_plugin")]
    pub fn new(
        plugins: Vec<(turbo_tasks::ResolvedVc<SwcPluginModule>, serde_json::Value)>,
    ) -> Self {
        Self { plugins }
    }

    // [TODO] Due to WEB-1102 putting this module itself behind compile time feature
    // doesn't work. Instead allow to instantiate dummy instance.
    #[cfg(not(feature = "swc_ecma_transform_plugin"))]
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl CustomTransformer for SwcEcmaTransformPluginsTransformer {
    #[cfg_attr(not(feature = "swc_ecma_transform_plugin"), allow(unused))]
    #[tracing::instrument(level = tracing::Level::TRACE, name = "swc_ecma_transform_plugin", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        #[cfg(feature = "swc_ecma_transform_plugin")]
        {
            use std::{cell::RefCell, rc::Rc, sync::Arc};

            use swc_core::{
                common::{
                    comments::SingleThreadedComments,
                    plugin::{
                        metadata::TransformPluginMetadataContext, serialized::PluginSerializedBytes,
                    },
                    util::take::Take,
                },
                ecma::ast::Module,
                plugin::proxies::{COMMENTS, HostCommentsStorage},
            };
            use swc_plugin_backend_wasmer::WasmerRuntime;
            use turbo_tasks::TryJoinIterExt;

            let plugins = self
                .plugins
                .iter()
                .map(async |(plugin_module, config)| {
                    let plugin_module = plugin_module.await?;
                    Ok((
                        config.clone(),
                        Box::new(plugin_module.0.clone_module(&WasmerRuntime)),
                    ))
                })
                .try_join()
                .await?;

            let should_enable_comments_proxy =
                !ctx.comments.leading.is_empty() && !ctx.comments.trailing.is_empty();

            //[TODO]: as same as swc/core does, we should set should_enable_comments_proxy
            // depends on the src's comments availability. For now, check naively if leading
            // / trailing comments are empty.
            let comments = if should_enable_comments_proxy {
                // Plugin only able to accept singlethreaded comments, interop from
                // multithreaded comments.
                let mut leading =
                    swc_core::common::comments::SingleThreadedCommentsMapInner::default();
                ctx.comments.leading.as_ref().into_iter().for_each(|c| {
                    leading.insert(*c.key(), c.value().clone());
                });

                let mut trailing =
                    swc_core::common::comments::SingleThreadedCommentsMapInner::default();
                ctx.comments.trailing.as_ref().into_iter().for_each(|c| {
                    trailing.insert(*c.key(), c.value().clone());
                });

                Some(SingleThreadedComments::from_leading_and_trailing(
                    Rc::new(RefCell::new(leading)),
                    Rc::new(RefCell::new(trailing)),
                ))
            } else {
                None
            };

            let transformed_program =
                COMMENTS.set(&HostCommentsStorage { inner: comments }, || {
                    let module_program =
                        std::mem::replace(program, Program::Module(Module::dummy()));
                    let module_program =
                        swc_core::common::plugin::serialized::VersionedSerializable::new(
                            module_program,
                        );
                    let mut serialized_program =
                        PluginSerializedBytes::try_serialize(&module_program)?;

                    let transform_metadata_context = Arc::new(TransformPluginMetadataContext::new(
                        Some(ctx.file_path_str.to_string()),
                        //[TODO]: Support env-related variable injection, i.e process.env.NODE_ENV
                        "development".to_string(),
                        None,
                    ));

                    // Run plugin transformation against current program.
                    // We do not serialize / deserialize between each plugin execution but
                    // copies raw transformed bytes directly into plugin's memory space.
                    // Note: This doesn't mean plugin won't perform any se/deserialization: it
                    // still have to construct from raw bytes internally to perform actual
                    // transform.
                    for (plugin_config, plugin_module) in plugins {
                        let mut transform_plugin_executor =
                            swc_core::plugin_runner::create_plugin_transform_executor(
                                ctx.source_map,
                                &ctx.unresolved_mark,
                                &transform_metadata_context,
                                None,
                                plugin_module,
                                Some(plugin_config),
                                Arc::new(WasmerRuntime),
                            );

                        serialized_program = transform_plugin_executor
                            .transform(&serialized_program, Some(should_enable_comments_proxy))?;
                    }

                    serialized_program.deserialize().map(|v| v.into_inner())
                })?;

            *program = transformed_program;
        }

        #[cfg(not(feature = "swc_ecma_transform_plugin"))]
        {
            use turbopack_core::issue::IssueExt;

            UnsupportedSwcEcmaTransformPluginsIssue {
                file_path: ctx.file_path.clone(),
            }
            .resolved_cell()
            .emit();
        }

        Ok(())
    }
}
