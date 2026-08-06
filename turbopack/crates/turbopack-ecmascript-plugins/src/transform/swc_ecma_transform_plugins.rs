use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    ecma::ast::Program,
    plugin_runner::plugin_module_bytes::{CompiledPluginModuleBytes, RawPluginModuleBytes},
};
use swc_plugin_backend_wasmtime::WasmtimeRuntime;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, StyledString};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

/// A wrapper around an SWC's ecma transform wasm plugin module bytes, allowing
/// it to operate with the turbo_tasks caching requirements.
///
/// Internally this contains a `CompiledPluginModuleBytes`, which points to the
/// compiled, serialized WASM module instead of raw file bytes to reduce the
/// cost of the compilation.
///
/// Tagged `evict = "last"` so eviction prefers evicting cheaper cells first —
/// re-deriving a compiled module is pure but pays a non-trivial WASM compile.
#[turbo_tasks::value(
    serialization = "skip",
    evict = "last",
    eq = "manual",
    cell = "new",
    shared
)]
pub struct SwcPluginModule {
    pub name: RcStr,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    pub plugin: swc_core::plugin_runner::plugin_module_bytes::CompiledPluginModuleBytes,
}

impl SwcPluginModule {
    pub fn new(plugin_name: RcStr, plugin_bytes: Vec<u8>) -> Self {
        Self {
            plugin: CompiledPluginModuleBytes::from_raw_module(
                &WasmtimeRuntime,
                RawPluginModuleBytes::new(plugin_name.to_string(), plugin_bytes),
            ),
            name: plugin_name,
        }
    }
}

#[turbo_tasks::value(shared)]
struct SwcEcmaTransformFailureIssue {
    pub file_path: FileSystemPath,
    pub description: StyledString,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for SwcEcmaTransformFailureIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Transform
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!("Failed to execute SWC plugin")))
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Stack(vec![
            StyledString::Text(rcstr!(
                "An unexpected error occurred when executing an SWC EcmaScript transform plugin."
            )),
            StyledString::Text(rcstr!(
                "This might be due to a version mismatch between the plugin and Next.js. \
                https://plugins.swc.rs/ can help you find the correct plugin version to use."
            )),
            StyledString::Text(Default::default()),
            self.description.clone(),
        ])))
    }
}

/// A custom transformer plugin to execute SWC's transform plugins.
#[derive(Debug)]
pub struct SwcEcmaTransformPluginsTransformer {
    plugins: Vec<(turbo_tasks::ResolvedVc<SwcPluginModule>, serde_json::Value)>,
}

impl SwcEcmaTransformPluginsTransformer {
    pub fn new(
        plugins: Vec<(turbo_tasks::ResolvedVc<SwcPluginModule>, serde_json::Value)>,
    ) -> Self {
        Self { plugins }
    }
}

#[async_trait]
impl CustomTransformer for SwcEcmaTransformPluginsTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "swc_ecma_transform_plugin", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        use std::sync::Arc;

        use anyhow::Context;
        use swc_core::{
            common::{
                plugin::{
                    metadata::TransformPluginMetadataContext, serialized::PluginSerializedBytes,
                },
                util::take::Take,
            },
            ecma::ast::Module,
            plugin::proxies::{COMMENTS, HostCommentsStorage},
            plugin_runner::plugin_module_bytes::CompiledPluginModuleBytes,
        };
        use swc_plugin_backend_wasmtime::WasmtimeRuntime;
        use turbo_tasks::TryJoinIterExt;

        let plugins = self
            .plugins
            .iter()
            .map(async |(plugin_module, config)| {
                let plugin_module = plugin_module.await?;
                Ok((
                    plugin_module.name.clone(),
                    config.clone(),
                    Box::new(plugin_module.plugin.clone_module(&WasmtimeRuntime)),
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
            Some(turbopack_ecmascript::swc_comments_to_single_threaded(
                ctx.comments,
            ))
        } else {
            None
        };

        fn transform(
            original_serialized_program: &PluginSerializedBytes,
            ctx: &TransformContext<'_>,
            plugins: Vec<(RcStr, serde_json::Value, Box<CompiledPluginModuleBytes>)>,
            should_enable_comments_proxy: bool,
        ) -> Result<Program> {
            use either::Either;

            let transform_metadata_context = Arc::new(TransformPluginMetadataContext::new(
                Some(ctx.file_path_str.to_string()),
                ctx.node_env.to_string(),
                None,
            ));

            let mut serialized_program = Either::Left(original_serialized_program);

            // Run plugin transformation against current program.
            // We do not serialize / deserialize between each plugin execution but
            // copies raw transformed bytes directly into plugin's memory space.
            // Note: This doesn't mean plugin won't perform any se/deserialization: it
            // still have to construct from raw bytes internally to perform actual
            // transform.
            for (plugin_name, plugin_config, plugin_module) in plugins {
                let mut transform_plugin_executor =
                    swc_core::plugin_runner::create_plugin_transform_executor(
                        ctx.source_map,
                        &ctx.unresolved_mark,
                        &transform_metadata_context,
                        None,
                        plugin_module,
                        Some(plugin_config),
                        Arc::new(WasmtimeRuntime),
                    );

                serialized_program = Either::Right(
                    transform_plugin_executor
                        .transform(
                            serialized_program.as_ref().either(|p| *p, |p| p),
                            Some(should_enable_comments_proxy),
                        )
                        .with_context(|| format!("Failed to execute {plugin_name}"))?,
                );
            }

            serialized_program
                .as_ref()
                .either(|p| *p, |p| p)
                .deserialize()
                .map(|v| v.into_inner())
        }

        let transformed_program = COMMENTS.set(&HostCommentsStorage { inner: comments }, || {
            let module_program = std::mem::replace(program, Program::Module(Module::dummy()));
            let module_program =
                swc_core::common::plugin::serialized::VersionedSerializable::new(module_program);
            let serialized_program = PluginSerializedBytes::try_serialize(&module_program)?;

            match transform(
                &serialized_program,
                ctx,
                plugins,
                should_enable_comments_proxy,
            ) {
                Ok(program) => anyhow::Ok(program),
                Err(e) => {
                    use turbopack_core::issue::IssueExt;

                    // Format the error chain without backtrace.
                    // Using `{:?}` would include the backtrace when
                    // RUST_BACKTRACE=1, which is not useful in
                    // user-facing error messages.
                    let mut description = e.to_string();
                    let mut causes = e.chain().skip(1).peekable();
                    if causes.peek().is_some() {
                        description.push_str("\n\nCaused by:");
                        for (i, cause) in causes.enumerate() {
                            description.push_str(&format!("\n    {i}: {cause}"));
                        }
                    }

                    SwcEcmaTransformFailureIssue {
                        file_path: ctx.file_path.clone(),
                        description: StyledString::Text(description.into()),
                    }
                    .resolved_cell()
                    .emit();

                    // On failure, return the original program.
                    Ok(module_program.into_inner())
                }
            }
        })?;

        *program = transformed_program;

        Ok(())
    }
}
