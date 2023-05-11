use turbo_binding::turbopack::{
    core::{
        asset::AssetVc,
        context::{AssetContext, AssetContextVc},
    },
    ecmascript::{
        EcmascriptInputTransform, EcmascriptInputTransformsVc, EcmascriptModuleAssetType,
        EcmascriptModuleAssetVc,
    },
};
use turbo_tasks::Value;

pub(crate) fn as_es_module_asset(
    asset: AssetVc,
    context: AssetContextVc,
) -> EcmascriptModuleAssetVc {
    EcmascriptModuleAssetVc::new(
        asset,
        context,
        Value::new(EcmascriptModuleAssetType::Typescript),
        EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript {
            use_define_for_class_fields: false,
        }]),
        Default::default(),
        context.compile_time_info(),
    )
}
