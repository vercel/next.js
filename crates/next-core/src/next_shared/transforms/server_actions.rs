use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::server_actions::{server_actions, Config};
use swc_core::{common::FileName, ecma::ast::Program};
use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;
use crate::next_config::CacheKinds;

#[derive(Debug)]
pub enum ActionsTransform {
    Client,
    Server,
}

/// Returns a rule which applies the Next.js Server Actions transform.
pub fn get_server_actions_transform_rule(
    transform: ActionsTransform,
    encryption_key: ResolvedVc<RcStr>,
    enable_mdx_rs: bool,
    use_cache_enabled: bool,
    cache_kinds: ResolvedVc<CacheKinds>,
) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(NextServerActions {
            transform,
            encryption_key,
            use_cache_enabled,
            cache_kinds,
        }) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: ResolvedVc::cell(vec![]),
            append: ResolvedVc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextServerActions {
    transform: ActionsTransform,
    encryption_key: ResolvedVc<RcStr>,
    use_cache_enabled: bool,
    cache_kinds: ResolvedVc<CacheKinds>,
}

#[async_trait]
impl CustomTransformer for NextServerActions {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "server_actions", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let actions = server_actions(
            &FileName::Real(ctx.file_path_str.into()),
            Config {
                is_react_server_layer: matches!(self.transform, ActionsTransform::Server),
                use_cache_enabled: self.use_cache_enabled,
                hash_salt: self.encryption_key.await?.to_string(),
                cache_kinds: self.cache_kinds.owned().await?,
            },
            ctx.comments.clone(),
            Default::default(),
        );
        program.mutate(actions);
        Ok(())
    }
}
