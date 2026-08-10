use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use swc_core::{
    ecma::ast::{Expr, Invalid},
    quote,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{ChunkingContext, ChunkingType},
    compile_time_info::CompileTimeDefineValue,
    emit_collect::EmittedModuleReference,
    issue::IssueSource,
    module::Module,
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        BindingUsage, ExportUsage, ModuleResolveResult, ResolveErrorMode,
        options::ResolveOptions,
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    analyzer::imports::ImportAnnotations,
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        AstPath,
        pattern_mapping::{PatternMapping, ResolveType},
        removal::RemovalCodeGen,
    },
    utils::AstPathRange,
};

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("emit {request} {namespace}")]
pub struct EmitReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    annotations: ImportAnnotations,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
    export_usage: ExportUsage,
    namespace: RcStr,
    data: Option<CompileTimeDefineValue>,
    emit_to_all_entries: bool,
}

impl EmitReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        annotations: ImportAnnotations,
        error_mode: ResolveErrorMode,
        export_usage: ExportUsage,
        namespace: RcStr,
        data: Option<CompileTimeDefineValue>,
        emit_to_all_entries: bool,
    ) -> Self {
        EmitReference {
            origin,
            request,
            issue_source,
            annotations,
            error_mode,
            export_usage,
            namespace,
            data,
            emit_to_all_entries,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EmitReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let origin = if let Some(transition) = self.annotations.transition() {
            self.origin
                .with_transition(transition.into())
                .await?
                .to_resolved()
                .await?
        } else {
            self.origin
        };

        if self.annotations.turbopack_loader().is_some()
            || self.annotations.turbopack_rename_as().is_some()
            || self.annotations.turbopack_module_type().is_some()
        {
            // TODO implement
            bail!(
                "turbopack_loader, turbopack_rename_as, and turbopack_module_type annotations are \
                 not yet supported for emit references"
            );
        }

        esm_resolve(
            *origin,
            *self.request,
            EcmaScriptModulesReferenceSubType::Emit,
            self.error_mode,
            Some(self.issue_source),
        )
        .await
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Emitted {
            merge_tag: self.namespace.clone(),
            emit_to_all_entries: self.emit_to_all_entries,
            // TODO make configurable
            is_async: false,
        })
    }

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage {
            import: Default::default(),
            export: self.export_usage.clone(),
        }
    }
}

#[turbo_tasks::value_impl]
impl EmittedModuleReference for EmitReference {
    #[turbo_tasks::function]
    fn data(&self) -> Vc<CompileTimeDefineValue> {
        self.data
            .clone()
            .unwrap_or(CompileTimeDefineValue::Undefined)
            .cell()
    }
}

impl IntoCodeGenReference for EmitReference {
    fn into_code_gen_reference(
        self,
        mut path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        path.0.pop();
        (
            ResolvedVc::upcast(reference),
            CodeGen::RemovalCodeGen(RemovalCodeGen::new(
                rcstr!("TURBOPACK collect"),
                AstPathRange::Exact(path.0),
            )),
        )
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("collect {namespace}")]
pub struct CollectReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    parent_module: ResolvedVc<Box<dyn Module>>,
    namespace: RcStr,
}

impl CollectReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        parent_module: ResolvedVc<Box<dyn Module>>,
        namespace: RcStr,
    ) -> Self {
        CollectReference {
            origin,
            parent_module,
            namespace,
        }
    }
}

fn collect_request() -> Vc<Request> {
    Request::parse_string(rcstr!("data:text/javascript,"))
}
#[turbo_tasks::function]
async fn with_data_uri(options: Vc<ResolveOptions>) -> Result<Vc<ResolveOptions>> {
    let mut options: ResolveOptions = options.owned().await?;
    options.parse_data_uris = true;
    Ok(options.cell())
}

#[turbo_tasks::value_impl]
impl ModuleReference for CollectReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let origin = self.origin.into_trait_ref().await?;

        // TODO unclear what the request should be here. The question is whether the CollectModule
        // should be configurable for the user or not.
        self.origin
            .resolve_asset(
                collect_request(),
                with_data_uri(origin.resolve_options()),
                ReferenceType::Collect {
                    parent_module: self.parent_module,
                    namespace: self.namespace.clone(),
                },
            )
            .await
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::PerEntry)
    }
}

impl IntoCodeGenReference for CollectReference {
    fn into_code_gen_reference(
        self,
        mut path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        path.0.pop();
        (
            ResolvedVc::upcast(reference),
            CodeGen::CollectReferenceCodeGen(CollectReferenceCodeGen { reference, path }),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct CollectReferenceCodeGen {
    reference: ResolvedVc<CollectReference>,
    path: AstPath,
}

impl CollectReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        let pm = PatternMapping::resolve_request(
            collect_request(),
            *reference.origin,
            chunking_context,
            self.reference.resolve_reference(),
            ResolveType::ChunkItem,
            Some(Vc::upcast(*self.reference)),
        )
        .await?;
        let mut visitors = Vec::new();

        visitors.push(create_visitor!(
            self.path,
            visit_mut_expr,
            |expr: &mut Expr| {
                *expr = quote!(
                    "$v.getList" as Expr,
                    v: Expr = pm.create_require(Expr::Invalid(Invalid::default()))
                );
            }
        ));

        Ok(CodeGeneration::visitors(visitors))
    }
}
