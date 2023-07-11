use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    context::AssetContext,
    file_source::FileSourceVc,
    reference::{AssetReference, AssetReferenceVc},
    reference_type::{ReferenceType, TypeScriptReferenceSubType},
    resolve::{
        origin::{ResolveOrigin, ResolveOriginVc},
        parse::RequestVc,
        pattern::QueryMapVc,
        ResolveResult, ResolveResultVc,
    },
};

use crate::typescript::{resolve::type_resolve, TsConfigModuleAssetVc};

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub struct TsConfigReference {
    pub tsconfig: FileSystemPathVc,
    pub origin: ResolveOriginVc,
}

#[turbo_tasks::value_impl]
impl TsConfigReferenceVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, tsconfig: FileSystemPathVc) -> Self {
        Self::cell(TsConfigReference { tsconfig, origin })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsConfigReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::asset(
            TsConfigModuleAssetVc::new(self.origin, FileSourceVc::new(self.tsconfig).into()).into(),
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
    pub origin: ResolveOriginVc,
    pub path: String,
}

#[turbo_tasks::value_impl]
impl TsReferencePathAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, path: String) -> Self {
        Self::cell(TsReferencePathAssetReference { origin, path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsReferencePathAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        Ok(
            if let Some(path) = &*self
                .origin
                .origin_path()
                .parent()
                .try_join(&self.path)
                .await?
            {
                ResolveResult::asset(
                    self.origin
                        .context()
                        .process(
                            FileSourceVc::new(*path).into(),
                            Value::new(ReferenceType::TypeScript(
                                TypeScriptReferenceSubType::Undefined,
                            )),
                        )
                        .into(),
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
    pub origin: ResolveOriginVc,
    pub module: String,
}

#[turbo_tasks::value_impl]
impl TsReferenceTypeAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, module: String) -> Self {
        Self::cell(TsReferenceTypeAssetReference { origin, module })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsReferenceTypeAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        type_resolve(
            self.origin,
            RequestVc::module(
                self.module.clone(),
                Value::new("".to_string().into()),
                QueryMapVc::none(),
            ),
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
