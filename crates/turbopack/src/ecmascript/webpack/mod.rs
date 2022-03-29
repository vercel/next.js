use anyhow::Result;
use swc_ecmascript::ast::Lit;
use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

use crate::{
    asset::{Asset, AssetRef},
    reference::{AssetReference, AssetReferenceRef, AssetReferencesSetRef},
    resolve::{parse::RequestRef, resolve, resolve_options, ResolveResult, ResolveResultRef},
    source_asset::SourceAssetRef,
};

use self::{
    parse::{is_webpack_runtime, WebpackRuntime, WebpackRuntimeRef},
    references::module_references,
};

use super::resolve::{apply_cjs_specific_options, cjs_resolve};

pub mod parse;
mod references;

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct ModuleAsset {
    pub source: AssetRef,
    pub runtime: WebpackRuntimeRef,
}

#[turbo_tasks::value_impl]
impl ModuleAssetRef {
    pub fn new(source: AssetRef, runtime: WebpackRuntimeRef) -> Self {
        Self::slot(ModuleAsset { source, runtime })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleAsset {
    fn path(&self) -> FileSystemPathRef {
        self.source.clone().path()
    }
    fn content(&self) -> FileContentRef {
        self.source.clone().content()
    }
    async fn references(&self) -> AssetReferencesSetRef {
        module_references(self.source.clone(), self.runtime.clone())
    }
}

#[turbo_tasks::value(shared, AssetReference)]
#[derive(PartialEq, Eq)]
pub struct WebpackChunkAssetReference {
    #[trace_ignore]
    pub chunk_id: Lit,
    pub runtime: WebpackRuntimeRef,
}

#[turbo_tasks::value_impl]
impl AssetReference for WebpackChunkAssetReference {
    async fn resolve_reference(&self) -> Result<ResolveResultRef> {
        let runtime = self.runtime.get().await?;
        Ok(match &*runtime {
            WebpackRuntime::Webpack5 {
                chunk_request_expr: _,
                context_path,
            } => {
                // TODO determine filename from chunk_request_expr
                let chunk_id = match &self.chunk_id {
                    Lit::Str(str) => str.value.to_string(),
                    Lit::Num(num) => format!("{num}"),
                    _ => todo!(),
                };
                let filename = format!("./chunks/{}.js", chunk_id);
                let source = SourceAssetRef::new(context_path.clone().join(&filename)).into();

                ResolveResult::Single(
                    ModuleAssetRef::new(source, self.runtime.clone()).into(),
                    None,
                )
                .into()
            }
            WebpackRuntime::None => ResolveResult::Unresolveable(None).into(),
        })
    }
}

#[turbo_tasks::value(shared, AssetReference)]
#[derive(PartialEq, Eq)]
pub struct WebpackEntryAssetReference {
    pub source: AssetRef,
    pub runtime: WebpackRuntimeRef,
}

#[turbo_tasks::value_impl]
impl AssetReference for WebpackEntryAssetReference {
    fn resolve_reference(&self) -> ResolveResultRef {
        ResolveResult::Single(
            ModuleAssetRef::new(self.source.clone(), self.runtime.clone()).into(),
            None,
        )
        .into()
    }
}

#[turbo_tasks::value(shared, AssetReference)]
#[derive(PartialEq, Eq)]
pub struct PotentialWebpackRuntimeAssetReference {
    pub source: AssetRef,
    pub request: RequestRef,
}

#[turbo_tasks::value_impl]
impl AssetReference for PotentialWebpackRuntimeAssetReference {
    async fn resolve_reference(&self) -> Result<ResolveResultRef> {
        let context = self.source.path().parent();

        let options = resolve_options(context.clone());

        let options = apply_cjs_specific_options(options);

        let resolved = resolve(context.clone(), self.request.clone(), options);

        if let ResolveResult::Single(source, refs) = &*resolved.await? {
            let runtime = is_webpack_runtime(source.clone());

            if let WebpackRuntime::Webpack5 { .. } = &*runtime.get().await? {
                return Ok(ResolveResult::Single(
                    ModuleAssetRef::new(source.clone(), runtime).into(),
                    refs.clone(),
                )
                .into());
            }
        }

        Ok(cjs_resolve(self.request.clone(), context))
    }
}
