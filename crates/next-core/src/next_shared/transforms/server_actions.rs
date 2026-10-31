use anyhow::Result;
use async_trait::async_trait;
use bincode::{Decode, Encode};
use next_custom_transforms::transforms::server_actions::{
    Config, ServerActionsMode, server_actions,
};
use swc_core::{common::FileName, ecma::ast::Program};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};
use crate::{mode::NextMode, next_config::CacheKinds};

#[turbo_tasks::task_input]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Encode, Decode)]
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
    let transformer = next_server_actions_transform_plugin(
        mode,
        transform,
        *encryption_key,
        use_cache_enabled,
        *cache_kinds,
    )
    .to_resolved()
    .await?;
    Ok(get_ecma_transform_rule(
        transformer,
        enable_mdx_rs,
        EcmascriptTransformStage::Preprocess,
    ))
}

#[turbo_tasks::function]
async fn next_server_actions_transform_plugin(
    mode: Vc<NextMode>,
    transform: ActionsTransform,
    encryption_key: ResolvedVc<RcStr>,
    use_cache_enabled: bool,
    cache_kinds: ResolvedVc<CacheKinds>,
) -> Result<Vc<TransformPlugin>> {
    Ok(Vc::cell(Box::new(NextServerActions {
        mode: *mode.await?,
        is_react_server_layer: matches!(transform, ActionsTransform::Server),
        encryption_key,
        use_cache_enabled,
        cache_kinds,
    }) as Box<dyn CustomTransformer + Send + Sync>))
}

#[derive(Debug)]
struct NextServerActions {
    is_react_server_layer: bool,
    encryption_key: ResolvedVc<RcStr>,
    use_cache_enabled: bool,
    cache_kinds: ResolvedVc<CacheKinds>,
    mode: NextMode,
}

#[async_trait]
impl CustomTransformer for NextServerActions {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "server_actions", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let file_name = FileName::Real(ctx.file_path_str.into());
        let run = async |program: &mut Program, hash_salt| -> Result<bool> {
            let mut actions = server_actions(
                &file_name,
                Some(ctx.query_str.clone()),
                Config {
                    is_react_server_layer: self.is_react_server_layer,
                    is_development: self.mode.is_development(),
                    use_cache_enabled: self.use_cache_enabled,
                    hash_salt,
                    cache_kinds: self.cache_kinds.owned().await?,
                },
                ctx.comments.clone(),
                ctx.unresolved_mark,
                ctx.source_map.clone(),
                Default::default(),
                ServerActionsMode::Turbopack,
            );
            program.mutate(&mut actions);
            Ok(actions.hash_salt_needed())
        };

        // The hash salt (the encryption key) is only needed for modules with server functions.
        // This transform runs on every module, so reading the key unconditionally would make every
        // module's parse depend on it, and a key change (e.g. key rotation or a per-build
        // `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`) would invalidate most of the build graph. Run
        // without the salt first, and only read it and run again if it turns out to be needed.
        if run(program, None).await? {
            let hash_salt = self.encryption_key.await?.to_string();
            run(program, Some(hash_salt)).await?;
        }
        Ok(())
    }
}
