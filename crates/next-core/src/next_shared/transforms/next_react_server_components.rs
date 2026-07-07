use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::react_server_components::*;
use swc_core::{
    common::FileName,
    ecma::{ast::Program, visit::VisitWith},
};
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::get_ecma_transform_rule;
use crate::{next_config::NextConfig, next_shared::transforms::EcmascriptTransformStage};

/// Returns a rule which applies the Next.js react server components transform.
/// This transform owns responsibility to assert various import / usage
/// conditions against each code's context. Refer below table how we are
/// applying this rules against various contexts.
///
/// +-----------------+---------+--------------------+
/// | Context\Enabled | Enabled | isReactServerLayer |
/// +-----------------+---------+--------------------+
/// | SSR             | true    | false              |
/// | Client          | true    | false              |
/// | Middleware      | false   | false              |
/// | Api             | false   | false              |
/// | RSC             | true    | true               |
/// | Pages           | true    | false              |
/// +-----------------+---------+--------------------+
pub async fn get_next_react_server_components_transform_rule(
    next_config: Vc<NextConfig>,
    is_react_server_layer: bool,
    app_dir: Option<FileSystemPath>,
) -> Result<ModuleRule> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();
    let cache_components_enabled = *next_config.enable_cache_components().await?;
    let use_cache_enabled = *next_config.enable_use_cache().await?;
    let taint_enabled = *next_config.enable_taint().await?;
    let page_extensions = next_config
        .page_extensions()
        .await?
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>();
    Ok(get_ecma_transform_rule(
        next_react_server_components_transform_plugin(
            is_react_server_layer,
            cache_components_enabled,
            use_cache_enabled,
            taint_enabled,
            app_dir,
            page_extensions,
        )
        .to_resolved()
        .await?,
        enable_mdx_rs,
        EcmascriptTransformStage::Preprocess,
    ))
}

#[turbo_tasks::function]
fn next_react_server_components_transform_plugin(
    is_react_server_layer: bool,
    cache_components_enabled: bool,
    use_cache_enabled: bool,
    taint_enabled: bool,
    app_dir: Option<FileSystemPath>,
    page_extensions: Vec<String>,
) -> Vc<TransformPlugin> {
    Vc::cell(Box::new(NextJsReactServerComponents {
        is_react_server_layer,
        cache_components_enabled,
        use_cache_enabled,
        taint_enabled,
        app_dir,
        page_extensions,
    }) as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct NextJsReactServerComponents {
    is_react_server_layer: bool,
    cache_components_enabled: bool,
    use_cache_enabled: bool,
    taint_enabled: bool,
    app_dir: Option<FileSystemPath>,
    page_extensions: Vec<String>,
}

#[async_trait]
impl CustomTransformer for NextJsReactServerComponents {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_react_server_components", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let file_name = if ctx.file_path_str.is_empty() {
            FileName::Anon
        } else {
            FileName::Real(ctx.file_path_str.into())
        };

        let mut visitor = server_components_assert(
            file_name,
            Config::WithOptions(Options {
                is_react_server_layer: self.is_react_server_layer,
                cache_components_enabled: self.cache_components_enabled,
                use_cache_enabled: self.use_cache_enabled,
                taint_enabled: self.taint_enabled,
                page_extensions: self.page_extensions.clone(),
            }),
            self.app_dir.as_ref().map(|path| path.path.clone().into()),
        );

        program.visit_with(&mut visitor);
        Ok(())
    }
}
