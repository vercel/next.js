use anyhow::Result;
use indexmap::indexmap;
use turbo_tasks::Value;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::{
    self,
    module_options::ModuleOptionsContextVc,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{Transition, TransitionVc},
    ModuleAssetContextVc,
};
use turbopack_core::{asset::AssetVc, compile_time_info::CompileTimeInfoVc, context::AssetContext};
use turbopack_ecmascript::{
    EcmascriptInputTransform, EcmascriptInputTransformsVc, EcmascriptModuleAssetType,
    EcmascriptModuleAssetVc, InnerAssetsVc,
};

use crate::{
    embed_js::next_asset, next_client_component::with_client_chunks::WithClientChunksAsset,
};

#[turbo_tasks::value(shared)]
pub struct NextLayoutEntryTransition {
    pub rsc_compile_time_info: CompileTimeInfoVc,
    pub rsc_module_options_context: ModuleOptionsContextVc,
    pub rsc_resolve_options_context: ResolveOptionsContextVc,
    pub server_root: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Transition for NextLayoutEntryTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: CompileTimeInfoVc,
    ) -> CompileTimeInfoVc {
        self.rsc_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.rsc_module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.rsc_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        let internal_asset = next_asset("entry/app/layout-entry.tsx");

        let asset = EcmascriptModuleAssetVc::new_with_inner_assets(
            internal_asset,
            context.into(),
            Value::new(EcmascriptModuleAssetType::Typescript),
            EcmascriptInputTransformsVc::cell(vec![
                EcmascriptInputTransform::TypeScript {
                    use_define_for_class_fields: false,
                },
                EcmascriptInputTransform::React { refresh: false },
            ]),
            context.compile_time_info(),
            InnerAssetsVc::cell(indexmap! {
                "PAGE".to_string() => asset
            }),
        );

        Ok(WithClientChunksAsset {
            asset: asset.into(),
            // next.js code already adds _next prefix
            server_root: self.server_root.join("_next"),
        }
        .cell()
        .into())
    }
}
