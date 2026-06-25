use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::ModuleReferences,
    source::OptionSource,
};

use crate::chunk::{
    EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports, ecmascript_chunk_item,
};

/// The root-served file name for a service worker registered at `scope`. One worker is supported
/// **per scope**; the scope is encoded into the (flat, root-served) file name so distinct scopes
/// get distinct files.
///
/// The human-readable slug is lossy (e.g. `/foo/bar` and `/foo-bar` both slugify to `foo-bar`), so
/// a hash of the original scope is appended to guarantee distinct scopes get distinct file names.
pub fn service_worker_chunk_filename(scope: &str) -> RcStr {
    let trimmed = scope.trim_matches('/');
    if trimmed.is_empty() {
        return rcstr!("sw.js");
    }
    let slug: String = trimmed
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => c,
            _ => '-',
        })
        .collect();
    let hash = encode_hex(hash_xxh3_hash64(trimmed));
    RcStr::from(format!("sw-{slug}-{hash}.js"))
}

/// A marker module that wraps a service-worker entry source plus its registration `scope`. It
/// carries the inner source so `next-api` can discover it in the module graph and compile it
/// standalone.
#[turbo_tasks::value(shared)]
pub struct ServiceWorkerEntryModule {
    pub inner: ResolvedVc<Box<dyn Module>>,
    pub scope: RcStr,
}

#[turbo_tasks::value_impl]
impl Module for ServiceWorkerEntryModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .inner
            .ident()
            .owned()
            .await?
            .with_modifier(format!("service worker entry [{}]", self.scope).into())
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        Vc::cell(vec![])
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::ModuleEvaluationIsSideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ServiceWorkerEntryModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ServiceWorkerEntryModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::None.cell()
    }

    #[turbo_tasks::function]
    fn chunk_item_content(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Vc<EcmascriptChunkItemContent> {
        // Marker module: contributes no code to the page bundle.
        EcmascriptChunkItemContent::default().cell()
    }
}
