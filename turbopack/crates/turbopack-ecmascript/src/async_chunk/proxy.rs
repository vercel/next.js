use std::sync::Arc;

use anyhow::Result;
use indoc::formatdoc;
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{self, Expr, ExprStmt, Lit, ModuleItem, Stmt},
        codegen::{Emitter, text_writer::JsWriter},
    },
    quote_expr,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, State, ValueToString, Vc};
use turbo_tasks_fs::rope::Rope;
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, ChunkingType},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    resolve::{
        BindingUsage, ExportUsage, ImportUsage, ModuleResolveResult, origin::ResolveOrigin,
        parse::Request,
    },
};

use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    references::pattern_mapping::{PatternMapping, ResolveType},
    runtime_functions::{TURBOPACK_ASYNC_LOADER, TURBOPACK_EXPORT_NAMESPACE},
    utils::{StringifyJs, StringifyModuleId},
};

fn proxy_import_code(import: Expr) -> Result<Rope> {
    let expr = quote_expr!(
        "$export_namespace($import)",
        export_namespace: Expr = TURBOPACK_EXPORT_NAMESPACE.into(),
        import: Expr = import,
    );
    let module = ast::Module {
        span: DUMMY_SP,
        body: vec![ModuleItem::Stmt(Stmt::Expr(ExprStmt {
            span: DUMMY_SP,
            expr,
        }))],
        shebang: None,
    };
    let source_map: Arc<swc_core::common::SourceMap> = Default::default();
    let mut bytes = Vec::new();
    let writer = JsWriter::new(source_map.clone(), "\n", &mut bytes, None);
    let mut emitter = Emitter {
        cfg: swc_core::ecma::codegen::Config::default(),
        cm: source_map,
        comments: None,
        wr: writer,
    };
    emitter.emit_module(&module)?;
    Ok(bytes.into())
}

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
enum LazyCompilationTarget {
    Unresolved {
        reference: ResolvedVc<Box<dyn ModuleReference>>,
        request: ResolvedVc<Request>,
        request_string: RcStr,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        import_externals: bool,
    },
    Resolved(ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>),
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
    pub fn new_unresolved(
        reference: ResolvedVc<Box<dyn ModuleReference>>,
        request: ResolvedVc<Request>,
        request_string: RcStr,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        import_externals: bool,
        ident: ResolvedVc<AssetIdent>,
        key: RcStr,
    ) -> Vc<Self> {
        Self::cell(Self {
            target: LazyCompilationTarget::Unresolved {
                reference,
                request,
                request_string,
                origin,
                import_externals,
            }
            .resolved_cell(),
            ident,
            key,
        })
    }

    #[turbo_tasks::function]
    pub fn new_resolved(
        target: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        ident: ResolvedVc<AssetIdent>,
        key: RcStr,
    ) -> Vc<Self> {
        Self::cell(Self {
            target: LazyCompilationTarget::Resolved(target).resolved_cell(),
            ident,
            key,
        })
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

        match &*self.target.await? {
            LazyCompilationTarget::Unresolved { reference, .. } => Ok(Vc::cell(vec![*reference])),
            LazyCompilationTarget::Resolved(target) => {
                let reference = LazyCompilationTargetReference::new(**target);
                Ok(Vc::cell(vec![ResolvedVc::upcast(
                    reference.to_resolved().await?,
                )]))
            }
        }
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
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
        let inner_code: Rope = if state.is_active() {
            match &*this.target.await? {
                LazyCompilationTarget::Resolved(target) => {
                    let loader_ident =
                        chunking_context.async_loader_chunk_item_ident(Vc::upcast(**target));
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
                    .into()
                }
                LazyCompilationTarget::Unresolved {
                    reference,
                    request,
                    request_string,
                    origin,
                    import_externals,
                } => {
                    let mapping = PatternMapping::resolve_request(
                        **request,
                        **origin,
                        chunking_context,
                        reference.resolve_reference(),
                        if chunking_context.chunk_loading().await?.can_split_async() {
                            ResolveType::AsyncChunkLoader
                        } else {
                            ResolveType::ChunkItem
                        },
                        Some(**reference),
                    )
                    .await?;
                    proxy_import_code(mapping.create_import(
                        Expr::Lit(Lit::Str(request_string.as_str().into())),
                        *import_externals,
                    ))?
                }
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
            .into()
        };

        Ok(EcmascriptChunkItemContent {
            inner_code,
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

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("lazy compilation target")]
struct LazyCompilationTargetReference {
    target: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl LazyCompilationTargetReference {
    #[turbo_tasks::function]
    fn new(target: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>) -> Vc<Self> {
        Self::cell(Self { target })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for LazyCompilationTargetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(ResolvedVc::upcast(self.target))
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
