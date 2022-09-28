use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResult, ResolveResultVc},
    source_asset::SourceAssetVc,
};

use crate::typescript::{resolve::type_resolve, TsConfigModuleAssetVc};

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub struct TsConfigReference {
    pub tsconfig: FileSystemPathVc,
    pub context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl TsConfigReferenceVc {
    #[turbo_tasks::function]
    pub fn new(tsconfig: FileSystemPathVc, context: AssetContextVc) -> Self {
        Self::cell(TsConfigReference { tsconfig, context })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsConfigReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        let context = self.context.with_context_path(self.tsconfig.parent());
        ResolveResult::Single(
            TsConfigModuleAssetVc::new(SourceAssetVc::new(self.tsconfig).into(), context).into(),
            Vec::new(),
        )
        .into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsConfigReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "tsconfig {}",
            self.tsconfig.to_string().await?,
        )))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct TsReferencePathAssetReference {
    pub context: AssetContextVc,
    pub path: String,
}

#[turbo_tasks::value_impl]
impl TsReferencePathAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, path: String) -> Self {
        Self::cell(TsReferencePathAssetReference { context, path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsReferencePathAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        Ok(
            if let Some(path) = &*self.context.context_path().try_join(&self.path).await? {
                ResolveResult::Single(
                    self.context.process(SourceAssetVc::new(*path).into()),
                    Vec::new(),
                )
                .into()
            } else {
                ResolveResult::unresolveable().into()
            },
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsReferencePathAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "typescript reference path comment {}",
            self.path,
        )))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct TsReferenceTypeAssetReference {
    pub context: AssetContextVc,
    pub module: String,
}

#[turbo_tasks::value_impl]
impl TsReferenceTypeAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, module: String) -> Self {
        Self::cell(TsReferenceTypeAssetReference { context, module })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsReferenceTypeAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        type_resolve(
            RequestVc::module(self.module.clone(), Value::new("".to_string().into())),
            self.context,
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsReferenceTypeAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "typescript reference type comment {}",
            self.module,
        )))
    }
}
