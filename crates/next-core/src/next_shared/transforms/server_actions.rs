use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::server_actions::{
    server_actions, Config, FileInfo, ServerActionsMode,
};
use swc_core::ecma::ast::Program;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;
use crate::{mode::NextMode, next_config::CacheKinds};

#[derive(Debug)]
pub enum ActionsTransform {
    /// Browser and SSR
    Client,
    /// RSC Server
    Server,
}

/// Returns a rule which applies the Next.js Server Actions transform.
pub async fn get_server_actions_transform_rule(
    mode: Vc<NextMode>,
    transform: ActionsTransform,
    encryption_key: ResolvedVc<RcStr>,
    enable_mdx_rs: bool,
    use_cache_enabled: bool,
    cache_kinds: ResolvedVc<CacheKinds>,
    app_dir: ResolvedVc<FileSystemPath>,
) -> Result<ModuleRule> {
    let transformer =
        EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(NextServerActions {
            mode: *mode.await?,
            transform,
            encryption_key,
            use_cache_enabled,
            cache_kinds,
            app_dir,
        }) as _));
    Ok(ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: ResolvedVc::cell(vec![]),
            append: ResolvedVc::cell(vec![transformer]),
        }],
    ))
}

#[derive(Debug)]
struct NextServerActions {
    transform: ActionsTransform,
    encryption_key: ResolvedVc<RcStr>,
    use_cache_enabled: bool,
    cache_kinds: ResolvedVc<CacheKinds>,
    mode: NextMode,
    app_dir: ResolvedVc<FileSystemPath>,
}

#[async_trait]
impl CustomTransformer for NextServerActions {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "server_actions", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let relative_file_path = self
            .app_dir
            .parent()
            .await?
            .get_relative_path_to(&*ctx.file_path.await?)
            .map(|path| path.trim_start_matches("./").into());

        let actions = server_actions(
            FileInfo {
                path: ctx.file_path_str.into(),
                relative_path: relative_file_path,
                query: Some(ctx.query_str.clone()),
            },
            Config {
                is_react_server_layer: matches!(self.transform, ActionsTransform::Server),
                is_development: self.mode.is_development(),
                use_cache_enabled: self.use_cache_enabled,
                hash_salt: self.encryption_key.await?.to_string(),
                cache_kinds: self.cache_kinds.owned().await?,
            },
            ctx.comments.clone(),
            ctx.source_map.clone(),
            Default::default(),
            ServerActionsMode::Turbopack,
        );
        program.mutate(actions);
        Ok(())
    }
}
