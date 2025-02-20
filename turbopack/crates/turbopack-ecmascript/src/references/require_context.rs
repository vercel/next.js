use std::{borrow::Cow, collections::VecDeque, sync::Arc};

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{
            Expr, ExprStmt, KeyValueProp, Lit, ModuleItem, ObjectLit, Prop, PropName, PropOrSpread,
            Stmt, {self},
        },
        codegen::{text_writer::JsWriter, Emitter},
    },
    quote, quote_expr,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, primitives::Regex, trace::TraceRawVcs, FxIndexMap, NonLocalValue,
    ResolvedVc, Value, ValueToString, Vc,
};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkItem, ChunkType, ChunkableModule, ChunkableModuleReference, ChunkingContext,
        ModuleChunkItemIdExt,
    },
    ident::AssetIdent,
    issue::IssueSource,
    module::Module,
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    resolve::{origin::ResolveOrigin, parse::Request, ModuleResolveResult},
    source::Source,
};
use turbopack_resolve::ecmascript::cjs_resolve;

use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType, EcmascriptExports,
    },
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        pattern_mapping::{PatternMapping, ResolveType},
        AstPath,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_MODULE_CONTEXT, TURBOPACK_REQUIRE},
    utils::module_id_to_lit,
    EcmascriptChunkPlaceable,
};

#[turbo_tasks::value]
#[derive(Debug)]
pub(crate) enum DirListEntry {
    File(ResolvedVc<FileSystemPath>),
    Dir(ResolvedVc<DirList>),
}

#[turbo_tasks::value(transparent)]
pub(crate) struct DirList(FxIndexMap<RcStr, DirListEntry>);

#[turbo_tasks::value_impl]
impl DirList {
    #[turbo_tasks::function]
    pub(crate) fn read(dir: Vc<FileSystemPath>, recursive: bool, filter: Vc<Regex>) -> Vc<Self> {
        Self::read_internal(dir, dir, recursive, filter)
    }

    #[turbo_tasks::function]
    pub(crate) async fn read_internal(
        root: Vc<FileSystemPath>,
        dir: Vc<FileSystemPath>,
        recursive: bool,
        filter: Vc<Regex>,
    ) -> Result<Vc<Self>> {
        let root_val = &*dir.await?;
        let regex = &*filter.await?;

        let mut list = FxIndexMap::default();

        let dir_content = dir.read_dir().await?;
        let entries = match &*dir_content {
            DirectoryContent::Entries(entries) => Some(entries),
            DirectoryContent::NotFound => None,
        };

        for (_, entry) in entries.iter().flat_map(|m| m.iter()) {
            match entry {
                DirectoryEntry::File(path) => {
                    if let Some(relative_path) = root_val.get_relative_path_to(&*path.await?) {
                        if regex.is_match(&relative_path) {
                            list.insert(relative_path, DirListEntry::File(*path));
                        }
                    }
                }
                DirectoryEntry::Directory(path) if recursive => {
                    if let Some(relative_path) = root_val.get_relative_path_to(&*path.await?) {
                        list.insert(
                            relative_path,
                            DirListEntry::Dir(
                                DirList::read_internal(root, **path, recursive, filter)
                                    .to_resolved()
                                    .await?,
                            ),
                        );
                    }
                }
                // ignore everything else
                _ => {}
            }
        }

        list.sort_keys();

        Ok(Vc::cell(list))
    }

    #[turbo_tasks::function]
    async fn flatten(self: Vc<Self>) -> Result<Vc<FlatDirList>> {
        let this = self.await?;

        let mut queue = VecDeque::from([this]);

        let mut list = FxIndexMap::default();

        while let Some(dir) = queue.pop_front() {
            for (k, entry) in &*dir {
                match entry {
                    DirListEntry::File(path) => {
                        list.insert(k.clone(), *path);
                    }
                    DirListEntry::Dir(d) => {
                        queue.push_back(d.await?);
                    }
                }
            }
        }

        Ok(Vc::cell(list))
    }
}

#[turbo_tasks::value(transparent)]
pub(crate) struct FlatDirList(FxIndexMap<RcStr, ResolvedVc<FileSystemPath>>);

#[turbo_tasks::value_impl]
impl FlatDirList {
    #[turbo_tasks::function]
    pub(crate) fn read(dir: Vc<FileSystemPath>, recursive: bool, filter: Vc<Regex>) -> Vc<Self> {
        DirList::read(dir, recursive, filter).flatten()
    }
}

#[turbo_tasks::value]
#[derive(Debug)]
pub struct RequireContextMapEntry {
    pub origin_relative: RcStr,
    pub request: ResolvedVc<Request>,
    pub result: ResolvedVc<ModuleResolveResult>,
}

/// The resolved context map for a `require.context(..)` call.
#[turbo_tasks::value(transparent)]
pub struct RequireContextMap(FxIndexMap<RcStr, RequireContextMapEntry>);

#[turbo_tasks::value_impl]
impl RequireContextMap {
    #[turbo_tasks::function]
    pub(crate) async fn generate(
        origin: Vc<Box<dyn ResolveOrigin>>,
        dir: Vc<FileSystemPath>,
        recursive: bool,
        filter: Vc<Regex>,
        issue_source: Option<IssueSource>,
        is_optional: bool,
    ) -> Result<Vc<Self>> {
        let origin_path = &*origin.origin_path().parent().await?;

        let list = &*FlatDirList::read(dir, recursive, filter).await?;

        let mut map = FxIndexMap::default();

        for (context_relative, path) in list {
            if let Some(origin_relative) = origin_path.get_relative_path_to(&*path.await?) {
                let request = Request::parse(Value::new(origin_relative.clone().into()))
                    .to_resolved()
                    .await?;
                let result = cjs_resolve(origin, *request, issue_source.clone(), is_optional)
                    .to_resolved()
                    .await?;

                map.insert(
                    context_relative.clone(),
                    RequireContextMapEntry {
                        origin_relative,
                        request,
                        result,
                    },
                );
            } else {
                bail!("invariant error: this was already checked in `list_dir`");
            }
        }

        Ok(Vc::cell(map))
    }
}

/// A reference for `require.context()`, will replace it with an inlined map
/// wrapped in `__turbopack_module_context__`;
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct RequireContextAssetReference {
    pub inner: ResolvedVc<RequireContextAsset>,
    pub dir: RcStr,
    pub include_subdirs: bool,

    pub issue_source: Option<IssueSource>,
    pub in_try: bool,
}

impl RequireContextAssetReference {
    pub async fn new(
        source: ResolvedVc<Box<dyn Source>>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        dir: RcStr,
        include_subdirs: bool,
        filter: Vc<Regex>,
        issue_source: Option<IssueSource>,
        in_try: bool,
    ) -> Result<Self> {
        let map = RequireContextMap::generate(
            *origin,
            origin.origin_path().parent().join(dir.clone()),
            include_subdirs,
            filter,
            issue_source.clone(),
            in_try,
        )
        .to_resolved()
        .await?;
        let inner = RequireContextAsset {
            source,
            origin,
            map,

            dir: dir.clone(),
            include_subdirs,
        }
        .resolved_cell();

        Ok(RequireContextAssetReference {
            inner,
            dir,
            include_subdirs,
            issue_source,
            in_try,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for RequireContextAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(ResolvedVc::upcast(self.inner))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for RequireContextAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(
            format!(
                "require.context {}/{}",
                self.dir,
                if self.include_subdirs { "**" } else { "*" },
            )
            .into(),
        )
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for RequireContextAssetReference {}

impl IntoCodeGenReference for RequireContextAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::RequireContextAssetReferenceCodeGen(RequireContextAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct RequireContextAssetReferenceCodeGen {
    path: AstPath,
    reference: ResolvedVc<RequireContextAssetReference>,
}

impl RequireContextAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let module_id = self
            .reference
            .await?
            .inner
            .chunk_item_id(Vc::upcast(chunking_context))
            .await?;

        let mut visitors = Vec::new();

        visitors.push(create_visitor!(self.path, visit_mut_expr(expr: &mut Expr) {
            if let Expr::Call(_) = expr {
                *expr = quote!(
                    "$turbopack_module_context($turbopack_require($id))" as Expr,
                    turbopack_module_context: Expr = TURBOPACK_MODULE_CONTEXT.into(),
                    turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                    id: Expr = module_id_to_lit(&module_id)
                );
            }
        }));

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
pub struct RequireContextAsset {
    source: ResolvedVc<Box<dyn Source>>,

    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    map: ResolvedVc<RequireContextMap>,

    dir: RcStr,
    include_subdirs: bool,
}

#[turbo_tasks::function]
fn modifier(dir: RcStr, include_subdirs: bool) -> Vc<RcStr> {
    Vc::cell(
        format!(
            "require.context {}/{}",
            dir,
            if include_subdirs { "**" } else { "*" },
        )
        .into(),
    )
}

#[turbo_tasks::value_impl]
impl Module for RequireContextAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source
            .ident()
            .with_modifier(modifier(self.dir.clone(), self.include_subdirs))
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
}

#[turbo_tasks::value_impl]
impl Asset for RequireContextAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        unimplemented!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for RequireContextAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        let this = self.await?;
        Ok(Vc::upcast(
            RequireContextChunkItem {
                module_graph,
                chunking_context,
                inner: self,

                origin: this.origin,
                map: this.map,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for RequireContextAsset {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
pub struct RequireContextChunkItem {
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    inner: ResolvedVc<RequireContextAsset>,

    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    map: ResolvedVc<RequireContextMap>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for RequireContextChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let map = &*self.map.await?;

        let mut context_map = ObjectLit {
            span: DUMMY_SP,
            props: vec![],
        };

        for (key, entry) in map {
            let pm = PatternMapping::resolve_request(
                *entry.request,
                *self.origin,
                *ResolvedVc::upcast(self.chunking_context),
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
                value: quote_expr!(
                    "{ id: () => $id, module: () => $module }",
                    id: Expr =
                        pm.create_id(Cow::Borrowed(&key_expr)),
                    module: Expr =
                        pm.create_require(Cow::Borrowed(&key_expr)),
                ),
            };

            context_map
                .props
                .push(PropOrSpread::Prop(Box::new(Prop::KeyValue(prop))));
        }

        let expr = quote_expr!(
            "$turbopack_export_value($obj);",
            turbopack_export_value: Expr = TURBOPACK_EXPORT_VALUE.into(),
            obj: Expr = Expr::Object(context_map),
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
        let mut bytes: Vec<u8> = vec![];
        let mut emitter = Emitter {
            cfg: swc_core::ecma::codegen::Config::default(),
            cm: source_map.clone(),
            comments: None,
            wr: JsWriter::new(source_map, "\n", &mut bytes, None),
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
impl ChunkItem for RequireContextChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *ResolvedVc::upcast(self.chunking_context)
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
