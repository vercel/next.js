use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    reference::ModuleReference,
    resolve::{ModulePart, ModuleResolveResult},
};

use crate::{tree_shake::asset::EcmascriptModulePartAsset, EcmascriptModuleAsset};

/// A reference to the [EcmascriptModuleLocalsModule] variant of an original
/// module.
#[turbo_tasks::value]
pub struct EcmascriptModulePartReference {
    pub module: ResolvedVc<EcmascriptModuleAsset>,
    pub part: ModulePart,
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<EcmascriptModuleAsset>, part: ModulePart) -> Vc<Self> {
        EcmascriptModulePartReference { module, part }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(self.part.to_string().into()))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let module = EcmascriptModulePartAsset::new(*self.module, self.part.clone())
            .to_resolved()
            .await?;

        Ok(*ModuleResolveResult::module(ResolvedVc::upcast(module)))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::ParallelInheritAsync))
    }
}
