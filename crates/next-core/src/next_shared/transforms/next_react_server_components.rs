use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::react_server_components::*;
use swc_core::{
    common::FileName,
    ecma::{ast::Program, visit::VisitWith},
};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::get_ecma_transform_rule;
use crate::{next_config::NextConfig, next_shared::transforms::get_ecma_transform_rule_new};

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
    app_dir: Option<Vc<FileSystemPath>>,
) -> Result<ModuleRule> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();
    let dynamic_io_enabled = *next_config.enable_dynamic_io().await?;
    Ok(get_ecma_transform_rule_new(
        NextJsReactServerComponents::new(is_react_server_layer, dynamic_io_enabled, app_dir)
            .to_resolved()
            .await?,
        enable_mdx_rs,
        true,
    ))
}

#[derive(Debug)]
struct NextJsReactServerComponents {
    is_react_server_layer: bool,
    dynamic_io_enabled: bool,
    app_dir: Option<ResolvedVc<FileSystemPath>>,
}

#[turbo_tasks::value_impl]
impl NextJsReactServerComponents {
    #[turbo_tasks::function]
    fn new(
        is_react_server_layer: bool,
        dynamic_io_enabled: bool,
        app_dir: Option<ResolvedVc<FileSystemPath>>,
    ) -> Vc<TransformPlugin> {
        Vc::cell(Box::new(Self {
            is_react_server_layer,
            dynamic_io_enabled,
            app_dir,
        }) as _)
    }
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
                dynamic_io_enabled: self.dynamic_io_enabled,
            }),
            match self.app_dir {
                None => None,
                Some(path) => Some(path.await?.path.clone().into()),
            },
        );

        program.visit_with(&mut visitor);
        Ok(())
    }
}
