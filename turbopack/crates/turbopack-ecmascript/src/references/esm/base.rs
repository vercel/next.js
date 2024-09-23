use anyhow::{anyhow, bail, Result};
use lazy_static::lazy_static;
use strsim::jaro;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{self, Expr, ExprStmt, Ident, Lit, ModuleItem, Program, Script, Stmt},
    quote,
};
use turbo_tasks::{RcStr, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{
        ChunkItemExt, ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    context::AssetContext,
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    module::Module,
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ImportWithType},
    resolve::{
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        ExternalType, ModulePart, ModuleResolveResult, ModuleResolveResultItem,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use super::export::{all_known_export_names, is_export_missing};
use crate::{
    analyzer::imports::ImportAnnotations,
    chunk::EcmascriptChunkPlaceable,
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor, magic_identifier,
    references::util::{request_to_string, throw_module_not_found_expr},
    tree_shake::{asset::EcmascriptModulePartAsset, TURBOPACK_PART_IMPORT_SOURCE},
    utils::module_id_to_lit,
};

#[turbo_tasks::value]
pub enum ReferencedAsset {
    Some(Vc<Box<dyn EcmascriptChunkPlaceable>>),
    External(RcStr, ExternalType),
    None,
}

impl ReferencedAsset {
    pub async fn get_ident(&self) -> Result<Option<String>> {
        Ok(match self {
            ReferencedAsset::Some(asset) => Some(Self::get_ident_from_placeable(asset).await?),
            ReferencedAsset::External(request, ty) => Some(magic_identifier::mangle(&format!(
                "{ty} external {request}"
            ))),
            ReferencedAsset::None => None,
        })
    }

    pub(crate) async fn get_ident_from_placeable(
        asset: &Vc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Result<String> {
        let path = asset.ident().to_string().await?;
        Ok(magic_identifier::mangle(&format!(
            "imported module {}",
            path
        )))
    }
}

#[turbo_tasks::value_impl]
impl ReferencedAsset {
    #[turbo_tasks::function]
    pub async fn from_resolve_result(resolve_result: Vc<ModuleResolveResult>) -> Result<Vc<Self>> {
        // TODO handle multiple keyed results
        for (_key, result) in resolve_result.await?.primary.iter() {
            match result {
                ModuleResolveResultItem::External(request, ty) => {
                    return Ok(ReferencedAsset::External(request.clone(), *ty).cell());
                }
                &ModuleResolveResultItem::Module(module) => {
                    if let Some(placeable) =
                        Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(module)
                            .await?
                    {
                        return Ok(ReferencedAsset::cell(ReferencedAsset::Some(placeable)));
                    }
                }
                // TODO ignore should probably be handled differently
                _ => {}
            }
        }
        Ok(ReferencedAsset::cell(ReferencedAsset::None))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub annotations: ImportAnnotations,
    /// True if the import should be ignored
    /// This can happen for example when the webpackIgnore or turbopackIgnore
    /// directives are present
    pub ignore: bool,
    pub issue_source: Vc<IssueSource>,
    pub export_name: Option<Vc<ModulePart>>,
    pub import_externals: bool,
}

/// A list of [EsmAssetReference]s
#[turbo_tasks::value(transparent)]
pub struct EsmAssetReferences(Vec<Vc<EsmAssetReference>>);

impl EsmAssetReference {
    fn get_origin(&self) -> Vc<Box<dyn ResolveOrigin>> {
        let mut origin = self.origin;
        if let Some(transition) = self.annotations.transition() {
            origin = origin.with_transition(transition.into());
        }
        origin
    }
}

#[turbo_tasks::value_impl]
impl EsmAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        issue_source: Vc<IssueSource>,
        annotations: Value<ImportAnnotations>,
        export_name: Option<Vc<ModulePart>>,
        import_externals: bool,
        ignore: bool,
    ) -> Vc<Self> {
        Self::cell(EsmAssetReference {
            origin,
            request,
            issue_source,
            annotations: annotations.into_value(),
            ignore,
            export_name,
            import_externals,
        })
    }

    #[turbo_tasks::function]
    pub(crate) fn get_referenced_asset(self: Vc<Self>) -> Vc<ReferencedAsset> {
        ReferencedAsset::from_resolve_result(self.resolve_reference())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        if self.ignore {
            return Ok(ModuleResolveResult::ignored().cell());
        }
        let ty = if matches!(self.annotations.module_type(), Some("json")) {
            EcmaScriptModulesReferenceSubType::ImportWithType(ImportWithType::Json)
        } else if let Some(part) = self.export_name {
            // This is a strange place to handle this, but see https://github.com/vercel/next.js/pull/70336
            if *part.await? == ModulePart::Evaluation {
                if let Some(module) = Vc::try_resolve_sidecast::<
                    Box<dyn crate::EcmascriptChunkPlaceable>,
                >(self.origin)
                .await?
                {
                    if *module
                        .is_marked_as_side_effect_free(
                            self.origin.asset_context().side_effect_free_packages(),
                        )
                        .await?
                    {
                        return Ok(ModuleResolveResult::ignored().cell());
                    }
                }
            }

            EcmaScriptModulesReferenceSubType::ImportPart(part)
        } else {
            EcmaScriptModulesReferenceSubType::Import
        };

        if let Request::Module { module, .. } = &*self.request.await? {
            if module == TURBOPACK_PART_IMPORT_SOURCE {
                if let Some(part) = self.export_name {
                    let module: Vc<crate::EcmascriptModuleAsset> =
                        Vc::try_resolve_downcast_type(self.origin)
                            .await?
                            .expect("EsmAssetReference origin should be a EcmascriptModuleAsset");

                    let part_module = *EcmascriptModulePartAsset::select_part(module, part).await?;

                    return match part_module {
                        Some(part_module) => Ok(ModuleResolveResult::module(part_module).cell()),
                        None => Ok(ModuleResolveResult::ignored().cell()),
                    };
                }

                bail!("export_name is required for part import")
            }
        }

        let result = esm_resolve(
            self.get_origin().resolve().await?,
            self.request,
            Value::new(ty),
            IssueSeverity::Error.cell(),
            Some(self.issue_source),
        );

        if let Some(part) = self.export_name {
            let part = part.await?;
            if let &ModulePart::Export(export_name, is_proxy) = &*part {
                // If is_proxy true, user did not speicifed the exact export name in the direct
                // import. Instead, they did `export * from './foo'`.
                if !*is_proxy.await? {
                    for &module in result.primary_modules().await? {
                        if let Some(module) = Vc::try_resolve_downcast(module).await? {
                            let export = export_name.await?;
                            if *is_export_missing(module, export.clone_value()).await? {
                                InvalidExport {
                                    export: export_name,
                                    module,
                                    source: self.issue_source,
                                }
                                .cell()
                                .emit();
                            }
                        }
                    }
                }
            }
        }

        Ok(result)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EsmAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!(
                "import {} with {}",
                self.request.to_string().await?,
                self.annotations
            )
            .into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EsmAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Result<Vc<ChunkingTypeOption>> {
        Ok(Vc::cell(
            if let Some(chunking_type) = self.annotations.chunking_type() {
                match chunking_type {
                    "parallel" => Some(ChunkingType::ParallelInheritAsync),
                    "none" => None,
                    _ => return Err(anyhow!("unknown chunking_type: {}", chunking_type)),
                }
            } else {
                Some(ChunkingType::ParallelInheritAsync)
            },
        ))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let mut visitors = Vec::new();

        let this = &*self.await?;
        let chunking_type = self.chunking_type().await?;
        let resolved = self.resolve_reference().await?;

        // Insert code that throws immediately at time of import if a request is
        // unresolvable
        if resolved.is_unresolveable_ref() {
            let request = request_to_string(this.request).await?.to_string();
            visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
                insert_hoisted_stmt(program, Stmt::Expr(ExprStmt {
                        expr: Box::new(throw_module_not_found_expr(
                          &request
                        )),
                        span: DUMMY_SP,
                    }));
            }));

            return Ok(CodeGeneration { visitors }.into());
        }

        // only chunked references can be imported
        if chunking_type.is_some() {
            let referenced_asset = self.get_referenced_asset().await?;
            let import_externals = this.import_externals;
            if let Some(ident) = referenced_asset.get_ident().await? {
                match &*referenced_asset {
                    ReferencedAsset::Some(asset) => {
                        let id = asset
                            .as_chunk_item(Vc::upcast(chunking_context))
                            .id()
                            .await?;
                        visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
                            let stmt = quote!(
                                "var $name = __turbopack_import__($id);" as Stmt,
                                name = Ident::new(ident.clone().into(), DUMMY_SP, Default::default()),
                                id: Expr = module_id_to_lit(&id),
                            );
                            insert_hoisted_stmt(program, stmt);
                        }));
                    }
                    ReferencedAsset::External(request, ExternalType::EcmaScriptModule) => {
                        if !*chunking_context
                            .environment()
                            .supports_esm_externals()
                            .await?
                        {
                            bail!(
                                "the chunking context ({}) does not support external modules (esm \
                                 request: {})",
                                chunking_context.name().await?,
                                request
                            );
                        }
                        let request = request.clone();
                        visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
                            let stmt = if import_externals {
                                quote!(
                                    "var $name = __turbopack_external_import__($id);" as Stmt,
                                    name = Ident::new(ident.clone().into(), DUMMY_SP, Default::default()),
                                    id: Expr = Expr::Lit(request.to_string().into())
                                )
                            } else {
                                quote!(
                                    "var $name = __turbopack_external_require__($id, true);" as Stmt,
                                    name = Ident::new(ident.clone().into(), DUMMY_SP, Default::default()),
                                    id: Expr = Expr::Lit(request.to_string().into())
                                )
                            };
                            insert_hoisted_stmt(program, stmt);
                        }));
                    }
                    ReferencedAsset::External(
                        request,
                        ExternalType::CommonJs | ExternalType::Url,
                    ) => {
                        if !*chunking_context
                            .environment()
                            .supports_commonjs_externals()
                            .await?
                        {
                            bail!(
                                "the chunking context ({}) does not support external modules \
                                 (request: {})",
                                chunking_context.name().await?,
                                request
                            );
                        }
                        let request = request.clone();
                        visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
                            let stmt = quote!(
                                "var $name = __turbopack_external_require__($id, true);" as Stmt,
                                name = Ident::new(ident.clone().into(), DUMMY_SP, Default::default()),
                                id: Expr = Expr::Lit(request.to_string().into())
                            );
                            insert_hoisted_stmt(program, stmt);
                        }));
                    }
                    #[allow(unreachable_patterns)]
                    ReferencedAsset::External(request, ty) => {
                        bail!(
                            "Unsupported external type {:?} for ESM reference with request: {:?}",
                            ty,
                            request
                        )
                    }
                    ReferencedAsset::None => {}
                }
            }
        }

        Ok(CodeGeneration { visitors }.into())
    }
}

lazy_static! {
    static ref ESM_HOISTING_LOCATION: &'static str = Box::leak(Box::new(magic_identifier::mangle(
        "ecmascript hoisting location"
    )));
}

pub(crate) fn insert_hoisted_stmt(program: &mut Program, stmt: Stmt) {
    match program {
        Program::Module(ast::Module { body, .. }) => {
            let pos = body.iter().position(|item| {
                if let ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                    expr: box Expr::Lit(Lit::Str(s)),
                    ..
                })) = item
                {
                    &*s.value == *ESM_HOISTING_LOCATION
                } else {
                    false
                }
            });
            if let Some(pos) = pos {
                let has_stmt = body[0..pos].iter().any(|item| {
                    if let ModuleItem::Stmt(item_stmt) = item {
                        stmt == *item_stmt
                    } else {
                        false
                    }
                });
                if !has_stmt {
                    body.insert(pos, ModuleItem::Stmt(stmt));
                }
            } else {
                body.splice(
                    0..0,
                    [
                        ModuleItem::Stmt(stmt),
                        ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                            expr: Box::new(Expr::Lit(Lit::Str((*ESM_HOISTING_LOCATION).into()))),
                            span: DUMMY_SP,
                        })),
                    ],
                );
            }
        }
        Program::Script(Script { body, .. }) => {
            let pos = body.iter().position(|item| {
                if let Stmt::Expr(ExprStmt {
                    expr: box Expr::Lit(Lit::Str(s)),
                    ..
                }) = item
                {
                    &*s.value == *ESM_HOISTING_LOCATION
                } else {
                    false
                }
            });
            if let Some(pos) = pos {
                body.insert(pos, stmt);
            } else {
                body.insert(
                    0,
                    Stmt::Expr(ExprStmt {
                        expr: Box::new(Expr::Lit(Lit::Str((*ESM_HOISTING_LOCATION).into()))),
                        span: DUMMY_SP,
                    }),
                );
                body.insert(0, stmt);
            }
        }
    }
}

#[turbo_tasks::value(shared)]
pub struct InvalidExport {
    export: Vc<RcStr>,
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    source: Vc<IssueSource>,
}

#[turbo_tasks::value_impl]
impl Issue for InvalidExport {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.into()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Line(vec![
            StyledString::Text("Export ".into()),
            StyledString::Code(self.export.await?.clone_value()),
            StyledString::Text(" doesn't exist in target module".into()),
        ])
        .cell())
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Bindings.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        let export = self.export.await?;
        let export_names = all_known_export_names(self.module).await?;
        let did_you_mean = export_names
            .iter()
            .map(|s| (s, jaro(export.as_str(), s.as_str())))
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
            .map(|(s, _)| s);
        Ok(Vc::cell(Some(
            StyledString::Stack(vec![
                StyledString::Line(vec![
                    StyledString::Text("The export ".into()),
                    StyledString::Code(export.clone_value()),
                    StyledString::Text(" was not found in module ".into()),
                    StyledString::Strong(self.module.ident().to_string().await?.clone_value()),
                    StyledString::Text(".".into()),
                ]),
                if let Some(did_you_mean) = did_you_mean {
                    StyledString::Line(vec![
                        StyledString::Text("Did you mean to import ".into()),
                        StyledString::Code(did_you_mean.clone()),
                        StyledString::Text("?".into()),
                    ])
                } else {
                    StyledString::Strong("The module has no exports at all.".into())
                },
                StyledString::Text(
                    "All exports of the module are statically known (It doesn't have dynamic \
                     exports). So it's known statically that the requested export doesn't exist."
                        .into(),
                ),
            ])
            .cell(),
        )))
    }

    #[turbo_tasks::function]
    async fn detail(&self) -> Result<Vc<OptionStyledString>> {
        let export_names = all_known_export_names(self.module).await?;
        Ok(Vc::cell(Some(
            StyledString::Line(vec![
                StyledString::Text("These are the exports of the module:\n".into()),
                StyledString::Code(
                    export_names
                        .iter()
                        .map(|s| s.as_str())
                        .intersperse(", ")
                        .collect::<String>()
                        .into(),
                ),
            ])
            .cell(),
        )))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }
}
