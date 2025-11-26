use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::server_actions::{
    Config, ServerActionsMode, server_actions,
};
use swc_core::{common::FileName, ecma::ast::Program};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
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
) -> Result<ModuleRule> {
    let transformer =
        EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(NextServerActions {
            mode: *mode.await?,
            transform,
            encryption_key,
            use_cache_enabled,
            cache_kinds,
        }) as _));
    Ok(ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![transformer]),
            main: ResolvedVc::cell(vec![]),
            postprocess: ResolvedVc::cell(vec![]),
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
}

#[async_trait]
impl CustomTransformer for NextServerActions {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "server_actions", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let actions = server_actions(
            &FileName::Real(ctx.file_path_str.into()),
            Some(ctx.query_str.clone()),
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
