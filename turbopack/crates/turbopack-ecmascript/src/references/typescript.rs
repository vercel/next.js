use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    context::AssetContext,
    file_source::FileSource,
    reference::ModuleReference,
    reference_type::{ReferenceType, TypeScriptReferenceSubType},
    resolve::{ModuleResolveResult, origin::ResolveOrigin, parse::Request},
};
use turbopack_resolve::typescript::type_resolve;

use crate::typescript::TsConfigModuleAsset;

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub struct TsConfigReference {
    pub tsconfig: FileSystemPath,
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
}

#[turbo_tasks::value_impl]
impl TsConfigReference {
    #[turbo_tasks::function]
    pub fn new(origin: ResolvedVc<Box<dyn ResolveOrigin>>, tsconfig: FileSystemPath) -> Vc<Self> {
        Self::cell(TsConfigReference { tsconfig, origin })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for TsConfigReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        Ok(*ModuleResolveResult::module(ResolvedVc::upcast(
            TsConfigModuleAsset::new(
                *self.origin,
                Vc::upcast(FileSource::new(self.tsconfig.clone())),
            )
            .to_resolved()
            .await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsConfigReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("tsconfig {}", self.tsconfig.value_to_string().await?).into(),
        ))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct TsReferencePathAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub path: RcStr,
}

#[turbo_tasks::value_impl]
impl TsReferencePathAssetReference {
    #[turbo_tasks::function]
    pub fn new(origin: ResolvedVc<Box<dyn ResolveOrigin>>, path: RcStr) -> Vc<Self> {
        Self::cell(TsReferencePathAssetReference { origin, path })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for TsReferencePathAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        Ok(
            if let Some(path) = self
                .origin
                .origin_path()
                .await?
                .parent()
                .try_join(&self.path)?
            {
                let module = self
                    .origin
                    .asset_context()
                    .process(
                        Vc::upcast(FileSource::new(path.clone())),
                        ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined),
                    )
                    .module()
                    .to_resolved()
                    .await?;
                *ModuleResolveResult::module(module)
            } else {
                *ModuleResolveResult::unresolvable()
            },
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsReferencePathAssetReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(format!("typescript reference path comment {}", self.path,).into())
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct TsReferenceTypeAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub module: RcStr,
}

#[turbo_tasks::value_impl]
impl TsReferenceTypeAssetReference {
    #[turbo_tasks::function]
    pub fn new(origin: ResolvedVc<Box<dyn ResolveOrigin>>, module: RcStr) -> Vc<Self> {
        Self::cell(TsReferenceTypeAssetReference { origin, module })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for TsReferenceTypeAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        type_resolve(
            *self.origin,
            Request::module(
                self.module.clone().into(),
                RcStr::default().into(),
                RcStr::default(),
                RcStr::default(),
            ),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsReferenceTypeAssetReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(format!("typescript reference type comment {}", self.module,).into())
    }
}
