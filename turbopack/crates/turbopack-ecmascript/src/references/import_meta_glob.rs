use std::{borrow::Cow, sync::Arc};

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use once_cell::sync::Lazy;
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{
            Expr, ExprStmt, KeyValueProp, Lit, ModuleItem, ObjectLit, Prop, PropName, PropOrSpread,
            Stmt,
        },
        codegen::{Emitter, text_writer::JsWriter},
    },
    quote_expr,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkItem, ChunkType, ChunkableModule, ChunkableModuleReference, ChunkingContext,
        MinifyType, ModuleChunkItemIdExt,
    },
    ident::AssetIdent,
    issue::IssueSource,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    output::OutputAssetsReference,
    reference::{ModuleReference, ModuleReferences},
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{ModuleResolveResult, origin::ResolveOrigin, parse::Request},
    source::Source,
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    EcmascriptChunkPlaceable,
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType, EcmascriptExports,
    },
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        AstPath,
        dir_list::{DirListFilter, FlatDirList},
        pattern_mapping::{PatternMapping, ResolveType},
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_REQUIRE},
    utils::module_id_to_lit,
};

#[turbo_tasks::value]
#[derive(Debug)]
pub struct ImportMetaGlobMapEntry {
    pub origin_relative: RcStr,
    pub request: ResolvedVc<Request>,
    pub result: ResolvedVc<ModuleResolveResult>,
}

/// The resolved glob map for an `import.meta.glob(..)` call.
#[turbo_tasks::value(transparent)]
pub struct ImportMetaGlobMap(
    #[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<RcStr, ImportMetaGlobMapEntry>,
);

#[turbo_tasks::value_impl]
impl ImportMetaGlobMap {
    #[turbo_tasks::function]
    pub(crate) async fn generate(
        origin: Vc<Box<dyn ResolveOrigin>>,
        dir: FileSystemPath,
        pattern: RcStr,
        issue_source: Option<IssueSource>,
        is_optional: bool,
    ) -> Result<Vc<Self>> {
        let origin_path = origin.origin_path().await?.parent();

        // TODO: we can look at the pattern for a static directory prefix, and use that to establish
        // a more refined search path
        let glob = Glob::new(pattern, GlobOptions::default());
        let list =
            &*FlatDirList::read(dir, /* recursive */ true, DirListFilter::Glob(glob)).await?;

        let mut map = FxIndexMap::default();

        for (context_relative, path) in list {
            let Some(origin_relative) = origin_path.get_relative_path_to(path) else {
                bail!("invariant error: this was already checked in `list_dir`");
            };

            // Ignoring "eager" eval for now, so only dynamic imports are supported
            let request = Request::parse(origin_relative.clone().into())
                .to_resolved()
                .await?;
            let result = esm_resolve(
                origin,
                *request,
                EcmaScriptModulesReferenceSubType::Import,
                is_optional,
                issue_source,
            )
            .await?
            .to_resolved()
            .await?;

            map.insert(
                context_relative.clone(),
                ImportMetaGlobMapEntry {
                    origin_relative,
                    request,
                    result,
                },
            );
        }

        Ok(Vc::cell(map))
    }
}

/// Reference to `import.meta.glob()`, which will be replaced with a require to a
/// synthetic module that exports an object mapping paths to import functions.
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct ImportMetaGlobAssetReference {
    pub inner: ResolvedVc<ImportMetaGlobAsset>,
    pub pattern: RcStr,
    pub eager: bool,
    pub import: Option<RcStr>,

    pub issue_source: Option<IssueSource>,
    pub in_try: bool,
}

impl ImportMetaGlobAssetReference {
    pub async fn new(
        source: ResolvedVc<Box<dyn Source>>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        pattern: RcStr,
        eager: bool,
        import: Option<RcStr>,
        issue_source: Option<IssueSource>,
        in_try: bool,
    ) -> Result<Self> {
        let map = ImportMetaGlobMap::generate(
            *origin,
            origin.origin_path().await?.parent(),
            pattern.clone(),
            issue_source,
            in_try,
        )
        .to_resolved()
        .await?;

        let inner = ImportMetaGlobAsset {
            source,
            origin,
            map,
            pattern: pattern.clone(),
            eager,
            import: import.clone(),
        }
        .resolved_cell();

        Ok(ImportMetaGlobAssetReference {
            inner,
            pattern,
            eager,
            import,
            issue_source,
            in_try,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for ImportMetaGlobAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(ResolvedVc::upcast(self.inner))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ImportMetaGlobAssetReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(format!("import.meta.glob {}", self.pattern).into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for ImportMetaGlobAssetReference {}

impl IntoCodeGenReference for ImportMetaGlobAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::ImportMetaGlobAssetReferenceCodeGen(ImportMetaGlobAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ImportMetaGlobAssetReferenceCodeGen {
    path: AstPath,
    reference: ResolvedVc<ImportMetaGlobAssetReference>,
}

impl ImportMetaGlobAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let module_id = self
            .reference
            .await?
            .inner
            .chunk_item_id(chunking_context)
            .await?;

        let mut visitors = Vec::new();

        visitors.push(create_visitor!(
            self.path,
            visit_mut_expr,
            |expr: &mut Expr| {
                if let Expr::Call(_) = expr {
                    *expr = Expr::Call(
                        quote_expr!(
                            "$turbopack_require($id)",
                            turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                            id: Expr = module_id_to_lit(&module_id)
                        )
                        .expect_call(),
                    );
                }
            }
        ));

        Ok(CodeGeneration::visitors(visitors))
    }
}

#[turbo_tasks::value(transparent)]
pub struct ResolvedModuleReference(ResolvedVc<ModuleResolveResult>);

#[turbo_tasks::value_impl]
impl ModuleReference for ResolvedModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *self.0
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ResolvedModuleReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("resolved reference".into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for ResolvedModuleReference {}

#[turbo_tasks::value]
pub struct ImportMetaGlobAsset {
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    map: ResolvedVc<ImportMetaGlobMap>,

    pattern: RcStr,
    eager: bool,
    import: Option<RcStr>,
}

fn modifier(pattern: &RcStr, eager: bool, import: &Option<RcStr>) -> RcStr {
    let mut parts = vec![format!("import.meta.glob {}", pattern)];
    if eager {
        parts.push("eager".to_string());
    }
    if let Some(import_name) = import {
        parts.push(format!("import:{}", import_name));
    }
    parts.join(" ").into()
}

#[turbo_tasks::value_impl]
impl Module for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source
            .ident()
            .with_modifier(modifier(&self.pattern, self.eager, &self.import))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(Some(self.source))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let map = &*self.map.await?;

        Ok(Vc::cell(
            map.iter()
                .map(|(_, entry)| {
                    ResolvedVc::upcast(ResolvedVc::<ResolvedModuleReference>::cell(entry.result))
                })
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        unimplemented!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        let this = self.await?;
        Ok(Vc::upcast(
            ImportMetaGlobChunkItem {
                module_graph,
                chunking_context,
                inner: self,
                origin: this.origin,
                map: this.map,
                eager: this.eager,
                import: this.import.clone(),
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
pub struct ImportMetaGlobChunkItem {
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    inner: ResolvedVc<ImportMetaGlobAsset>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    map: ResolvedVc<ImportMetaGlobMap>,
    eager: bool,
    import: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for ImportMetaGlobChunkItem {}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ImportMetaGlobChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let map = &*self.map.await?;
        let minify = self.chunking_context.minify_type().await?;

        // Generate: { './file.js': () => import('./file.js'), ... }
        let mut import_map = ObjectLit {
            span: DUMMY_SP,
            props: vec![],
        };

        for (key, entry) in map {
            let pm = PatternMapping::resolve_request(
                *entry.request,
                *self.origin,
                *self.chunking_context,
                *entry.result,
                ResolveType::ChunkItem,
            )
            .await?;

            let PatternMapping::Single(pm) = &*pm else {
                continue;
            };

            let key_expr = Expr::Lit(Lit::Str(entry.origin_relative.as_str().into()));

            let prop = KeyValueProp {
                key: PropName::Str(key.as_str().into()),
                value: Box::new(pm.create_import(Cow::Borrowed(&key_expr), false)),
            };

            import_map
                .props
                .push(PropOrSpread::Prop(Box::new(Prop::KeyValue(prop))));
        }

        let expr = quote_expr!(
            "$turbopack_export_value($obj);",
            turbopack_export_value: Expr = TURBOPACK_EXPORT_VALUE.into(),
            obj: Expr = Expr::Object(import_map),
        );

        // Export the generated object
        let module = swc_core::ecma::ast::Module {
            span: DUMMY_SP,
            body: vec![ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                span: DUMMY_SP,
                expr,
            }))],
            shebang: None,
        };

        let source_map: Arc<swc_core::common::SourceMap> = Default::default();

        let mut bytes: Vec<u8> = vec![];
        let mut wr: JsWriter<'_, &mut Vec<u8>> =
            JsWriter::new(source_map.clone(), "\n", &mut bytes, None);
        if matches!(*minify, MinifyType::Minify { .. }) {
            wr.set_indent_str("");
        }

        let mut emitter = Emitter {
            cfg: swc_core::ecma::codegen::Config::default(),
            cm: source_map.clone(),
            comments: None,
            wr,
        };

        emitter.emit_module(&module)?;

        Ok(EcmascriptChunkItemContent {
            inner_code: bytes.into(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ImportMetaGlobChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.inner)
    }
}
