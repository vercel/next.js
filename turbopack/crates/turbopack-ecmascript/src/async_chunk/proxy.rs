use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, State, ValueToString, Vc};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, ChunkingType},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    resolve::{BindingUsage, ExportUsage, ImportUsage, ModuleResolveResult},
};

use crate::{
    EcmascriptModuleAsset,
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    module_canonicalization::{EcmascriptModuleCanonicalization, canonicalize_ecmascript_module},
    runtime_functions::{TURBOPACK_ASYNC_LOADER, TURBOPACK_EXPORT_NAMESPACE},
    utils::{StringifyJs, StringifyModuleId},
};

#[turbo_tasks::value(serialization = "skip", evict = "never")]
pub struct LazyCompilationState {
    active: State<bool>,
}

impl LazyCompilationState {
    pub fn is_active(&self) -> bool {
        *self.active.get()
    }

    pub fn activate(&self) {
        self.active.set(true);
    }
}

/// Marks the file name of a lazily compiled dynamic import's manifest chunk, followed by
/// [`ACTIVATION_KEY_HEX_LEN`] hex digits.
const ACTIVATION_KEY_MARKER: &str = "lazy-compilation-";
const ACTIVATION_KEY_HEX_LEN: usize = 16;

/// The key that activates the lazily compiled dynamic import represented by `proxy_ident`.
///
/// The key is embedded in the file name of the proxy's manifest chunk (see
/// `ManifestAsyncModule::ident`), so a request for that chunk names the import to activate.
pub fn activation_key(proxy_ident: &str) -> RcStr {
    format!(
        "{ACTIVATION_KEY_MARKER}{:0width$x}",
        hash_xxh3_hash64(proxy_ident),
        width = ACTIVATION_KEY_HEX_LEN
    )
    .into()
}

/// Recovers the [`activation_key`] from the path of a requested chunk, if it is the manifest chunk
/// of a lazily compiled dynamic import.
pub fn activation_key_from_chunk_path(path: &str) -> Option<RcStr> {
    let start = path.rfind(ACTIVATION_KEY_MARKER)?;
    let key = path.get(start..start + ACTIVATION_KEY_MARKER.len() + ACTIVATION_KEY_HEX_LEN)?;
    key[ACTIVATION_KEY_MARKER.len()..]
        .bytes()
        .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
        .then(|| key.into())
}

/// The activation state of the lazily compiled dynamic import identified by `key`.
///
/// Memoized per key, so every proxy and every reader of a given key observe the same bit.
#[turbo_tasks::function]
pub fn lazy_compilation_state(key: RcStr) -> Vc<LazyCompilationState> {
    let _ = key;
    LazyCompilationState {
        active: State::new(false),
    }
    .cell()
}

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("lazy compilation target")]
pub enum LazyCompilationTarget {
    Deferred {
        module: ResolvedVc<EcmascriptModuleAsset>,
        canonicalization: EcmascriptModuleCanonicalization,
    },
    Direct(ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>),
}

#[turbo_tasks::value_impl]
impl LazyCompilationTarget {
    #[turbo_tasks::function]
    pub fn deferred(
        module: ResolvedVc<EcmascriptModuleAsset>,
        canonicalization: EcmascriptModuleCanonicalization,
    ) -> Vc<Self> {
        Self::cell(Self::Deferred {
            module,
            canonicalization,
        })
    }

    #[turbo_tasks::function]
    pub fn direct(module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>) -> Vc<Self> {
        Self::cell(Self::Direct(module))
    }

    #[turbo_tasks::function]
    pub async fn proxy_ident(&self) -> Result<Vc<AssetIdent>> {
        let ident = match self {
            Self::Deferred {
                module,
                canonicalization,
            } => module
                .ident()
                .owned()
                .await?
                .with_modifier(format!("lazy compilation proxy {canonicalization:?}").into()),
            Self::Direct(module) => module
                .ident()
                .owned()
                .await?
                .with_modifier(rcstr!("lazy compilation proxy")),
        };
        Ok(ident.into_vc())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for LazyCompilationTarget {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let module = match self {
            Self::Deferred {
                module,
                canonicalization,
            } => {
                canonicalize_ecmascript_module(**module, canonicalization.clone())
                    .to_resolved()
                    .await?
            }
            Self::Direct(module) => *module,
        };
        Ok(*ModuleResolveResult::module(ResolvedVc::upcast(module)))
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Async)
    }

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage {
            import: ImportUsage::TopLevel,
            export: ExportUsage::All,
        }
    }
}

#[turbo_tasks::value]
pub struct LazyCompilationProxyModule {
    target: ResolvedVc<LazyCompilationTarget>,
    ident: ResolvedVc<AssetIdent>,
    /// The key that requesting this proxy's manifest chunk activates.
    pub key: RcStr,
}

#[turbo_tasks::value_impl]
impl LazyCompilationProxyModule {
    #[turbo_tasks::function]
    pub async fn new(target: ResolvedVc<LazyCompilationTarget>) -> Result<Vc<Self>> {
        let ident = target.proxy_ident().to_resolved().await?;
        let key = activation_key(&ident.to_string().await?);
        Ok(Self::cell(Self { target, ident, key }))
    }
}

#[turbo_tasks::value_impl]
impl Module for LazyCompilationProxyModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        *self.ident
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        if !lazy_compilation_state(self.key.clone()).await?.is_active() {
            return Ok(ModuleReferences::empty());
        }

        Ok(Vc::cell(vec![ResolvedVc::upcast(self.target)]))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectful.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for LazyCompilationProxyModule {
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
impl EcmascriptChunkPlaceable for LazyCompilationProxyModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::DynamicNamespace.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        if estimated {
            return Ok(EcmascriptChunkItemContent::default().cell());
        }

        let state = lazy_compilation_state(this.key.clone()).await?;
        let inner_code = if state.is_active() {
            let result = this.target.resolve_reference().await?;
            let Some(module) = result.first_module().await? else {
                bail!("lazy compilation target did not resolve to a module");
            };
            let Some(target) =
                ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
            else {
                bail!("lazy compilation target is not an ecmascript chunk placeable module");
            };
            let loader_ident = chunking_context.async_loader_chunk_item_ident(Vc::upcast(*target));
            let loader_id = chunking_context
                .chunk_item_id_strategy()
                .await?
                .get_id_from_ident(loader_ident)
                .await?;
            formatdoc! {
                r#"
                    {TURBOPACK_EXPORT_NAMESPACE}({TURBOPACK_ASYNC_LOADER}({loader_id}));
                "#,
                loader_id = StringifyModuleId(&loader_id),
            }
        } else {
            // The manifest chunk that lists this chunk is only served once the proxy is active,
            // so this is only reachable through a stale cache.
            formatdoc! {
                r#"
                    {TURBOPACK_EXPORT_NAMESPACE}(Promise.reject(new Error({message})));
                "#,
                message = StringifyJs(&format!(
                    "Lazily compiled dynamic import of {} was not activated",
                    this.ident.to_string().await?
                )),
            }
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: inner_code.into(),
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn chunk_item_content_ident(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<AssetIdent>> {
        let this = self.await?;
        let state = lazy_compilation_state(this.key.clone()).await?;
        Ok(self
            .ident()
            .owned()
            .await?
            .with_modifier(if state.is_active() {
                rcstr!("active")
            } else {
                rcstr!("inactive")
            })
            .into_vc())
    }
}

#[cfg(test)]
mod tests {
    use super::{activation_key, activation_key_from_chunk_path};

    #[test]
    fn recovers_the_key_from_a_chunk_path() {
        let key = activation_key("[project]/app/target.tsx [app-client] (ecmascript)");
        // How the key survives `AssetIdent::output_name`: `/` and `.` become `_`, and the ident
        // hash is appended after it.
        let path = format!("static/chunks/app_target_tsx_{key}_1a2b3c4.js");
        assert_eq!(
            activation_key_from_chunk_path(&path).as_deref(),
            Some(&*key)
        );
    }

    #[test]
    fn ignores_paths_without_a_key() {
        assert_eq!(
            activation_key_from_chunk_path("static/chunks/app_page_1a2b3c4.js"),
            None
        );
        assert_eq!(
            activation_key_from_chunk_path("static/chunks/a_lazy-compilation-0123.js"),
            None
        );
        assert_eq!(
            activation_key_from_chunk_path("static/chunks/a_lazy-compilation-zzzzzzzzzzzzzzzz.js"),
            None
        );
    }
}
