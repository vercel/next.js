use anyhow::Result;
use indexmap::indexmap;
use turbo_binding::turbopack::{
    core::{
        asset::AssetVc,
        context::AssetContext,
        reference_type::{EntryReferenceSubType, ReferenceType},
    },
    ecmascript::{
        EcmascriptInputTransform, EcmascriptInputTransformsVc, EcmascriptModuleAssetType,
        EcmascriptModuleAssetVc, InnerAssetsVc,
    },
    turbopack::{
        transition::{Transition, TransitionVc},
        ModuleAssetContextVc,
    },
};
use turbo_tasks::{primitives::OptionStringVc, Value};

use crate::embed_js::next_asset;

#[turbo_tasks::value(shared)]
pub struct NextServerToClientTransition {
    pub ssr: bool,
}

#[turbo_tasks::value_impl]
impl Transition for NextServerToClientTransition {
    #[turbo_tasks::function]
    async fn process(
        self_vc: NextServerToClientTransitionVc,
        asset: AssetVc,
        context: ModuleAssetContextVc,
        _reference_type: Value<ReferenceType>,
    ) -> Result<AssetVc> {
        let internal_asset = next_asset(if self_vc.await?.ssr {
            "entry/app/server-to-client-ssr.tsx"
        } else {
            "entry/app/server-to-client.tsx"
        });
        let context = self_vc.process_context(context);
        let client_chunks = context.with_transition("next-client-chunks").process(
            asset,
            Value::new(ReferenceType::Entry(
                EntryReferenceSubType::AppClientComponent,
            )),
        );
        let client_module = context.with_transition("next-ssr-client-module").process(
            asset,
            Value::new(ReferenceType::Entry(
                EntryReferenceSubType::AppClientComponent,
            )),
        );
        Ok(EcmascriptModuleAssetVc::new_with_inner_assets(
            internal_asset,
            context.into(),
            Value::new(EcmascriptModuleAssetType::Typescript),
            EcmascriptInputTransformsVc::cell(vec![
                EcmascriptInputTransform::TypeScript {
                    use_define_for_class_fields: false,
                },
                EcmascriptInputTransform::React {
                    development: true,
                    refresh: false,
                    import_source: OptionStringVc::cell(None),
                    runtime: OptionStringVc::cell(None),
                },
            ]),
            Default::default(),
            context.compile_time_info(),
            InnerAssetsVc::cell(indexmap! {
                "CLIENT_MODULE".to_string() => client_module,
                "CLIENT_CHUNKS".to_string() => client_chunks,
            }),
        )
        .into())
    }
}
