use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{DUMMY_SP, util::take::Take},
    ecma::{
        ast::{
            CallExpr, Expr, ExprOrSpread, Lit, ObjectLit, Prop, PropName, PropOrSpread,
            SpreadElement,
        },
        utils::prop_name_eq,
    },
    quote,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{ChunkingContext, ChunkingType},
    issue::IssueSource,
    module::Module,
    reference::ModuleReference,
    reference_type::CommonJsReferenceSubType,
    resolve::{
        BindingUsage, ExportUsage, ImportUsage, ModuleResolveResult, ResolveErrorMode,
        origin::ResolveOrigin, parse::Request,
    },
};
use turbopack_resolve::ecmascript::cjs_resolve;

use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        AstPath,
        pattern_mapping::{PatternMapping, ResolveType},
        util::SpecifiedChunkingType,
    },
    runtime_functions::TURBOPACK_CACHE,
};

/// Generic CommonJS reference that doesn't perform any codegen. Used for tracing
#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("generic commonjs {request}")]
pub struct CjsAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub issue_source: IssueSource,
    pub error_mode: ResolveErrorMode,
}

#[turbo_tasks::value_impl]
impl CjsAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
    ) -> Result<Vc<Self>> {
        Ok(Self::cell(CjsAssetReference {
            origin,
            request,
            issue_source,
            error_mode,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CjsAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(
            *self.origin,
            *self.request,
            CommonJsReferenceSubType::Undefined,
            Some(self.issue_source),
            self.error_mode,
        )
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        })
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.issue_source)
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("require {request}")]
pub struct CjsRequireAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
    chunking_type_attribute: Option<SpecifiedChunkingType>,
    resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
    usage: ExportUsage,
    cjs_tree_shaking: bool,
}

impl CjsRequireAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
        chunking_type_attribute: Option<SpecifiedChunkingType>,
        resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
        usage: ExportUsage,
        cjs_tree_shaking: bool,
    ) -> Self {
        CjsRequireAssetReference {
            origin,
            request,
            issue_source,
            error_mode,
            chunking_type_attribute,
            resolve_override,
            usage,
            cjs_tree_shaking,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CjsRequireAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        if let Some(resolved) = &self.resolve_override {
            return *ModuleResolveResult::module(*resolved);
        }

        cjs_resolve(
            *self.origin,
            *self.request,
            CommonJsReferenceSubType::Undefined,
            Some(self.issue_source),
            self.error_mode,
        )
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        self.chunking_type_attribute.map_or_else(
            || {
                Some(ChunkingType::Parallel {
                    inherit_async: false,
                    hoisted: false,
                })
            },
            |c| c.as_chunking_type(false, false),
        )
    }

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage {
            import: ImportUsage::TopLevel,
            export: self.usage.clone(),
        }
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.issue_source)
    }
}

impl IntoCodeGenReference for CjsRequireAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::CjsRequireAssetReferenceCodeGen(CjsRequireAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct CjsRequireAssetReferenceCodeGen {
    reference: ResolvedVc<CjsRequireAssetReference>,
    path: AstPath,
}

impl CjsRequireAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        let pm = PatternMapping::resolve_request(
            *reference.request,
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
                let old_expr = expr.take();
                let message = if let Expr::Call(CallExpr { args, .. }) = old_expr {
                    match args.into_iter().next() {
                        Some(ExprOrSpread {
                            spread: None,
                            expr: key_expr,
                        }) => {
                            *expr = pm.create_require(*key_expr);
                            return;
                        }
                        Some(ExprOrSpread {
                            spread: Some(_),
                            expr: _,
                        }) => "spread operator is not analyze-able in require() expressions.",
                        _ => "require() expressions require at least 1 argument",
                    }
                } else {
                    "visitor must be executed on a CallExpr"
                };
                *expr = quote!(
                    "(() => { throw new Error($message); })()" as Expr,
                    message: Expr = Expr::Lit(Lit::Str(message.into()))
                );
            }
        ));

        Ok(CodeGeneration::visitors(visitors))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("require.resolve {request}")]
pub struct CjsRequireResolveAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
    chunking_type_attribute: Option<SpecifiedChunkingType>,
    resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
}

impl CjsRequireResolveAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
        chunking_type_attribute: Option<SpecifiedChunkingType>,
        resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
    ) -> Self {
        CjsRequireResolveAssetReference {
            origin,
            request,
            issue_source,
            error_mode,
            chunking_type_attribute,
            resolve_override,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        if let Some(resolved) = &self.resolve_override {
            return *ModuleResolveResult::module(*resolved);
        }

        cjs_resolve(
            *self.origin,
            *self.request,
            CommonJsReferenceSubType::Undefined,
            Some(self.issue_source),
            self.error_mode,
        )
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        self.chunking_type_attribute.map_or_else(
            || {
                Some(ChunkingType::Parallel {
                    inherit_async: false,
                    hoisted: false,
                })
            },
            |c| c.as_chunking_type(false, false),
        )
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.issue_source)
    }
}

impl IntoCodeGenReference for CjsRequireResolveAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::CjsRequireResolveAssetReferenceCodeGen(
                CjsRequireResolveAssetReferenceCodeGen { reference, path },
            ),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct CjsRequireResolveAssetReferenceCodeGen {
    reference: ResolvedVc<CjsRequireResolveAssetReference>,
    path: AstPath,
}

impl CjsRequireResolveAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        let pm = PatternMapping::resolve_request(
            *reference.request,
            *reference.origin,
            chunking_context,
            self.reference.resolve_reference(),
            ResolveType::ChunkItem,
            Some(Vc::upcast(*self.reference)),
        )
        .await?;
        let mut visitors = Vec::new();

        // Inline the result of the `require.resolve` call as a literal.
        visitors.push(create_visitor!(
            self.path,
            visit_mut_expr,
            |expr: &mut Expr| {
                if let Expr::Call(call_expr) = expr {
                    let args = std::mem::take(&mut call_expr.args);
                    *expr = match args.into_iter().next() {
                        Some(ExprOrSpread { expr, spread: None }) => pm.create_id(*expr),
                        other => {
                            let message = match other {
                                // These are SWC bugs: https://github.com/swc-project/swc/issues/5394
                                Some(ExprOrSpread {
                                    spread: Some(_),
                                    expr: _,
                                }) => {
                                    "spread operator is not analyze-able in require() expressions."
                                }
                                _ => "require() expressions require at least 1 argument",
                            };
                            quote!(
                                "(() => { throw new Error($message); })()" as Expr,
                                message: Expr = Expr::Lit(Lit::Str(message.into()))
                            )
                        }
                    };
                }
                // CjsRequireResolveAssetReference will only be used for Expr::Call.
                // Due to eventual consistency the path might match something else,
                // but we can ignore that as it will be recomputed anyway.
            }
        ));

        Ok(CodeGeneration::visitors(visitors))
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Debug, Hash, Encode, Decode,
)]
pub struct CjsRequireCacheAccess {
    pub path: AstPath,
}
impl CjsRequireCacheAccess {
    pub fn new(path: AstPath) -> Self {
        CjsRequireCacheAccess { path }
    }

    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let mut visitors = Vec::new();

        visitors.push(create_visitor!(
            self.path,
            visit_mut_expr,
            |expr: &mut Expr| {
                if let Expr::Member(_) = expr {
                    *expr = TURBOPACK_CACHE.into();
                } else {
                    unreachable!("`CjsRequireCacheAccess` is only created from `MemberExpr`");
                }
            }
        ));

        Ok(CodeGeneration::visitors(visitors))
    }
}

impl From<CjsRequireCacheAccess> for CodeGen {
    fn from(val: CjsRequireCacheAccess) -> Self {
        CodeGen::CjsRequireCacheAccess(val)
    }
}

/// Removes each named CommonJS export the module graph proved unused. Built by the
/// analyzer for statically-analyzable CommonJS modules; recognition happens inline
/// during the walk (see `analyzer::graph::visitor`).
#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct CjsExportsDropCodeGen {
    drops: Vec<DroppableCjsExportAssignment>,
    /// Writes to a discarded exports object, dropped whatever the export usage is.
    dead_writes: Vec<DroppableCjsExportAssignment>,
    /// Whether the module sets `__esModule`. Without it, a default import binds
    /// the whole `module.exports`, so nothing may be dropped.
    has_es_module: bool,
}

/// A recognized CommonJS export declaration, and thus how it's dropped.
#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub enum DroppableCjsExportAssignment {
    /// A standalone `exports.NAME = …` write or `Object.defineProperty(exports, …)`
    /// call (the assignment is replaced by its value; the define call is removed).
    Write { name: RcStr, path: AstPath },
    /// A `module.exports = { … }` object literal. Every recognized property name
    /// shares `path` (the assignment), so the literal is rewritten in one pass.
    ObjectLiteral { names: Vec<RcStr>, path: AstPath },
}

impl CjsExportsDropCodeGen {
    pub fn new(
        drops: Vec<DroppableCjsExportAssignment>,
        dead_writes: Vec<DroppableCjsExportAssignment>,
        has_es_module: bool,
    ) -> Self {
        CjsExportsDropCodeGen {
            drops,
            dead_writes,
            has_es_module,
        }
    }

    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        _exports: ResolvedVc<EcmascriptExports>,
    ) -> Result<CodeGeneration> {
        let export_usage_info = chunking_context
            .module_export_usage(*ResolvedVc::upcast(module))
            .await?;
        let export_usage_info = export_usage_info.export_usage.await?;

        // Without `__esModule`, a default import binds the whole `module.exports`,
        // so a used `default` makes every named export reachable — drop none of these.
        let drops = if !self.has_es_module && export_usage_info.is_export_used(&rcstr!("default")) {
            &[]
        } else {
            &self.drops[..]
        };

        // Replace each unused `exports.NAME = <value>` with `<value>`, preserving
        // side effects (the minifier drops a pure value). Rewriting the assignment
        // rather than its statement keeps chained writes like
        // `exports.a = exports.b = 1` sound.
        let mut visitors = Vec::new();
        for (drop, dead) in (self.dead_writes.iter().map(|drop| (drop, true)))
            .chain(drops.iter().map(|drop| (drop, false)))
        {
            match drop {
                DroppableCjsExportAssignment::Write { name, path } => {
                    if !dead && export_usage_info.is_export_used(name) {
                        continue;
                    }
                    visitors.push(create_visitor!(path, visit_mut_expr, |expr: &mut Expr| {
                        match expr {
                            // `exports.NAME = <value>` → `<value>` (keep side effects).
                            Expr::Assign(assign) => {
                                let value = assign.right.take();
                                *expr = *value;
                            }
                            // `Object.defineProperty(exports, …)`: keep an eager
                            // `value`'s side effects; a getter is lazy, drop the call.
                            Expr::Call(call) => {
                                *expr = match take_define_property_value(call) {
                                    Some(value) => *value,
                                    None => quote!("0" as Expr),
                                };
                            }
                            _ => {}
                        }
                    }));
                }
                DroppableCjsExportAssignment::ObjectLiteral { names, path } => {
                    let unused = names
                        .iter()
                        .filter(|name| dead || !export_usage_info.is_export_used(name))
                        .cloned()
                        .collect::<Vec<_>>();
                    if unused.is_empty() {
                        continue;
                    }
                    // `module.exports = { …, NAME: v, … }` → drop each unused `NAME`,
                    // keeping a data value's side effects in place via `...(void v)`.
                    visitors.push(create_visitor!(path, visit_mut_expr, |expr: &mut Expr| {
                        if let Expr::Assign(assign) = expr
                            && let Expr::Object(obj) = &mut *assign.right
                        {
                            drop_object_literal_exports(obj, &unused);
                        }
                    }));
                }
            }
        }

        Ok(CodeGeneration::visitors(visitors))
    }
}

/// Takes the `value: <expr>` out of an `Object.defineProperty` descriptor, if it
/// has one. A descriptor without `value` is a getter, so there's nothing to keep.
fn take_define_property_value(call: &mut CallExpr) -> Option<Box<Expr>> {
    let descriptor = call.args.get_mut(2)?;
    let Expr::Object(descriptor) = &mut *descriptor.expr else {
        return None;
    };
    descriptor.props.iter_mut().find_map(|prop| {
        let PropOrSpread::Prop(prop) = prop else {
            return None;
        };
        let Prop::KeyValue(kv) = &mut **prop else {
            return None;
        };
        prop_name_eq(&kv.key, "value").then(|| kv.value.take())
    })
}

/// Drops each of `names` from a `module.exports = { … }` literal.
fn drop_object_literal_exports(obj: &mut ObjectLit, names: &[RcStr]) {
    let is_dropped = |key: &PropName| names.iter().any(|n| prop_name_eq(key, n));
    obj.props = obj
        .props
        .take()
        .into_iter()
        .filter_map(|prop| {
            let PropOrSpread::Prop(p) = &prop else {
                return Some(prop);
            };
            match &**p {
                // The value might have a side effect, preserve it by generating `...void (expr)`
                Prop::KeyValue(kv) if is_dropped(&kv.key) => {
                    Some(PropOrSpread::Spread(SpreadElement {
                        dot3_token: DUMMY_SP,
                        expr: Box::new(quote!("void ($e)" as Expr, e: Expr = *kv.value.clone())),
                    }))
                }
                Prop::Shorthand(id) if names.iter().any(|n| id.sym.as_str() == &**n) => None,
                Prop::Getter(g) if is_dropped(&g.key) => None,
                Prop::Setter(s) if is_dropped(&s.key) => None,
                Prop::Method(m) if is_dropped(&m.key) => None,
                // A used export (or an already-rewritten spread) — keep as-is.
                _ => Some(prop),
            }
        })
        .collect();
}

impl From<CjsExportsDropCodeGen> for CodeGen {
    fn from(val: CjsExportsDropCodeGen) -> Self {
        CodeGen::CjsExportsDropCodeGen(val)
    }
}
