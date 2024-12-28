use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::cjs_optimizer::{cjs_optimizer, Config, PackageConfig};
use rustc_hash::FxHashMap;
use swc_core::{
    common::SyntaxContext,
    ecma::{ast::*, visit::VisitMutWith},
};
use turbo_tasks::ResolvedVc;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

pub fn get_next_cjs_optimizer_rule(enable_mdx_rs: bool) -> ModuleRule {
    // [NOTE]: This isn't user configurable config
    // (https://github.com/vercel/next.js/blob/a1d0259ea06592c5ca6df882e9b1d0d0121c5083/packages/next/src/build/swc/options.ts#L395)
    // build it internally without accepting customization.
    let config = Config {
        packages: FxHashMap::from_iter([(
            "next/server".to_string(),
            PackageConfig {
                transforms: FxHashMap::from_iter([
                    (
                        "NextRequest".into(),
                        "next/dist/server/web/spec-extension/request".into(),
                    ),
                    (
                        "NextResponse".into(),
                        "next/dist/server/web/spec-extension/response".into(),
                    ),
                    (
                        "ImageResponse".into(),
                        "next/dist/server/web/spec-extension/image-response".into(),
                    ),
                    (
                        "userAgentFromString".into(),
                        "next/dist/server/web/spec-extension/user-agent".into(),
                    ),
                    (
                        "userAgent".into(),
                        "next/dist/server/web/spec-extension/user-agent".into(),
                    ),
                    ("after".into(), "next/dist/server/after".into()),
                ]),
            },
        )]),
    };

    let transformer = EcmascriptInputTransform::Plugin(ResolvedVc::cell(
        Box::new(NextCjsOptimizer { config }) as _,
    ));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: ResolvedVc::cell(vec![]),
            append: ResolvedVc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextCjsOptimizer {
    config: Config,
}

#[async_trait]
impl CustomTransformer for NextCjsOptimizer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_cjs_optimizer", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let mut visitor = cjs_optimizer(
            self.config.clone(),
            SyntaxContext::empty().apply_mark(ctx.unresolved_mark),
        );

        program.visit_mut_with(&mut visitor);
        Ok(())
    }
}
