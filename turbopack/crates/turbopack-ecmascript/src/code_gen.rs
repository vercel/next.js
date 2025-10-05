use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    base::SwcComments,
    ecma::{
        ast::{
            BlockStmt, CallExpr, Expr, Lit, MemberExpr, ModuleDecl, ModuleItem, Pat, Program, Prop,
            SimpleAssignTarget, Stmt, Str, SwitchCase,
        },
        visit::AstParentKind,
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::{chunk::ChunkingContext, reference::ModuleReference};

use crate::{
    ScopeHoistingContext,
    references::{
        AstPath,
        amd::AmdDefineWithDependenciesCodeGen,
        cjs::{
            CjsRequireAssetReferenceCodeGen, CjsRequireCacheAccess,
            CjsRequireResolveAssetReferenceCodeGen,
        },
        constant_condition::ConstantConditionCodeGen,
        constant_value::ConstantValueCodeGen,
        dynamic_expression::DynamicExpression,
        esm::{
            EsmBinding, EsmModuleItem, ImportMetaBinding, ImportMetaRef,
            dynamic::EsmAsyncAssetReferenceCodeGen, module_id::EsmModuleIdAssetReferenceCodeGen,
            url::UrlAssetReferenceCodeGen,
        },
        ident::IdentReplacement,
        member::MemberReplacement,
        require_context::RequireContextAssetReferenceCodeGen,
        unreachable::Unreachable,
        worker::WorkerAssetReferenceCodeGen,
    },
};

#[derive(Default)]
pub struct CodeGeneration {
    /// ast nodes matching the span will be visitor by the visitor
    pub visitors: Vec<(Vec<AstParentKind>, Box<dyn AstModifier>)>,
    pub hoisted_stmts: Vec<CodeGenerationHoistedStmt>,
    pub early_hoisted_stmts: Vec<CodeGenerationHoistedStmt>,
    pub late_stmts: Vec<CodeGenerationHoistedStmt>,
    pub early_late_stmts: Vec<CodeGenerationHoistedStmt>,
    pub comments: Option<SwcComments>,
}

impl CodeGeneration {
    pub fn empty() -> Self {
        CodeGeneration {
            ..Default::default()
        }
    }

    pub fn new(
        visitors: Vec<(Vec<AstParentKind>, Box<dyn AstModifier>)>,
        hoisted_stmts: Vec<CodeGenerationHoistedStmt>,
        early_hoisted_stmts: Vec<CodeGenerationHoistedStmt>,
        late_stmts: Vec<CodeGenerationHoistedStmt>,
        early_late_stmts: Vec<CodeGenerationHoistedStmt>,
    ) -> Self {
        CodeGeneration {
            visitors,
            hoisted_stmts,
            early_hoisted_stmts,
            late_stmts,
            early_late_stmts,
            ..Default::default()
        }
    }

    pub fn visitors_with_comments(
        visitors: Vec<(Vec<AstParentKind>, Box<dyn AstModifier>)>,
        comments: SwcComments,
    ) -> Self {
        CodeGeneration {
            visitors,
            comments: Some(comments),
            ..Default::default()
        }
    }

    pub fn visitors(visitors: Vec<(Vec<AstParentKind>, Box<dyn AstModifier>)>) -> Self {
        CodeGeneration {
            visitors,
            ..Default::default()
        }
    }

    pub fn hoisted_stmt(key: RcStr, stmt: Stmt) -> Self {
        CodeGeneration {
            hoisted_stmts: vec![CodeGenerationHoistedStmt::new(key, stmt)],
            ..Default::default()
        }
    }

    pub fn hoisted_stmts(hoisted_stmts: Vec<CodeGenerationHoistedStmt>) -> Self {
        CodeGeneration {
            hoisted_stmts,
            ..Default::default()
        }
    }
}

#[derive(Clone)]
pub struct CodeGenerationHoistedStmt {
    pub key: RcStr,
    pub stmt: Stmt,
}

impl CodeGenerationHoistedStmt {
    pub fn new(key: RcStr, stmt: Stmt) -> Self {
        CodeGenerationHoistedStmt { key, stmt }
    }
}

macro_rules! method {
    ($name:ident, $T:ty) => {
        fn $name(&self, _node: &mut $T) {}
    };
}

pub trait AstModifier: Send + Sync {
    method!(visit_mut_prop, Prop);
    method!(visit_mut_simple_assign_target, SimpleAssignTarget);
    method!(visit_mut_expr, Expr);
    method!(visit_mut_member_expr, MemberExpr);
    method!(visit_mut_pat, Pat);
    method!(visit_mut_stmt, Stmt);
    method!(visit_mut_module_decl, ModuleDecl);
    method!(visit_mut_module_item, ModuleItem);
    method!(visit_mut_call_expr, CallExpr);
    method!(visit_mut_lit, Lit);
    method!(visit_mut_str, Str);
    method!(visit_mut_block_stmt, BlockStmt);
    method!(visit_mut_switch_case, SwitchCase);
    method!(visit_mut_program, Program);
}

pub trait ModifiableAst {
    fn modify(&mut self, modifier: &dyn AstModifier);
}

macro_rules! impl_modify {
    ($visit_mut_name:ident, $T:ty) => {
        impl ModifiableAst for $T {
            fn modify(&mut self, modifier: &dyn AstModifier) {
                modifier.$visit_mut_name(self)
            }
        }
    };
}

impl_modify!(visit_mut_prop, Prop);
impl_modify!(visit_mut_simple_assign_target, SimpleAssignTarget);
impl_modify!(visit_mut_expr, Expr);
impl_modify!(visit_mut_member_expr, MemberExpr);
impl_modify!(visit_mut_pat, Pat);
impl_modify!(visit_mut_stmt, Stmt);
impl_modify!(visit_mut_module_decl, ModuleDecl);
impl_modify!(visit_mut_module_item, ModuleItem);
impl_modify!(visit_mut_call_expr, CallExpr);
impl_modify!(visit_mut_lit, Lit);
impl_modify!(visit_mut_str, Str);
impl_modify!(visit_mut_block_stmt, BlockStmt);
impl_modify!(visit_mut_switch_case, SwitchCase);
impl_modify!(visit_mut_program, Program);

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub enum CodeGen {
    // AMD occurs very rarely and makes the enum much bigger
    AmdDefineWithDependenciesCodeGen(Box<AmdDefineWithDependenciesCodeGen>),
    CjsRequireCacheAccess(CjsRequireCacheAccess),
    ConstantConditionCodeGen(ConstantConditionCodeGen),
    ConstantValueCodeGen(ConstantValueCodeGen),
    DynamicExpression(DynamicExpression),
    EsmBinding(EsmBinding),
    EsmModuleItem(EsmModuleItem),
    IdentReplacement(IdentReplacement),
    ImportMetaBinding(ImportMetaBinding),
    ImportMetaRef(ImportMetaRef),
    MemberReplacement(MemberReplacement),
    Unreachable(Unreachable),
    CjsRequireAssetReferenceCodeGen(CjsRequireAssetReferenceCodeGen),
    CjsRequireResolveAssetReferenceCodeGen(CjsRequireResolveAssetReferenceCodeGen),
    EsmAsyncAssetReferenceCodeGen(EsmAsyncAssetReferenceCodeGen),
    EsmModuleIdAssetReferenceCodeGen(EsmModuleIdAssetReferenceCodeGen),
    RequireContextAssetReferenceCodeGen(RequireContextAssetReferenceCodeGen),
    UrlAssetReferenceCodeGen(UrlAssetReferenceCodeGen),
    WorkerAssetReferenceCodeGen(WorkerAssetReferenceCodeGen),
}

impl CodeGen {
    pub async fn code_generation(
        &self,
        ctx: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<CodeGeneration> {
        match self {
            Self::AmdDefineWithDependenciesCodeGen(v) => v.code_generation(ctx).await,
            Self::CjsRequireCacheAccess(v) => v.code_generation(ctx).await,
            Self::ConstantConditionCodeGen(v) => v.code_generation(ctx).await,
            Self::ConstantValueCodeGen(v) => v.code_generation(ctx).await,
            Self::DynamicExpression(v) => v.code_generation(ctx).await,
            Self::EsmBinding(v) => v.code_generation(ctx, scope_hoisting_context).await,
            Self::EsmModuleItem(v) => v.code_generation(ctx).await,
            Self::IdentReplacement(v) => v.code_generation(ctx).await,
            Self::ImportMetaBinding(v) => v.code_generation(ctx).await,
            Self::ImportMetaRef(v) => v.code_generation(ctx).await,
            Self::MemberReplacement(v) => v.code_generation(ctx).await,
            Self::Unreachable(v) => v.code_generation(ctx).await,
            Self::CjsRequireAssetReferenceCodeGen(v) => v.code_generation(ctx).await,
            Self::CjsRequireResolveAssetReferenceCodeGen(v) => v.code_generation(ctx).await,
            Self::EsmAsyncAssetReferenceCodeGen(v) => v.code_generation(ctx).await,
            Self::EsmModuleIdAssetReferenceCodeGen(v) => v.code_generation(ctx).await,
            Self::RequireContextAssetReferenceCodeGen(v) => v.code_generation(ctx).await,
            Self::UrlAssetReferenceCodeGen(v) => v.code_generation(ctx).await,
            Self::WorkerAssetReferenceCodeGen(v) => v.code_generation(ctx).await,
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct CodeGens(Vec<CodeGen>);

#[turbo_tasks::value_impl]
impl CodeGens {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

pub trait IntoCodeGenReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen);
}

pub fn path_to(
    path: &[AstParentKind],
    f: impl FnMut(&AstParentKind) -> bool,
) -> Vec<AstParentKind> {
    if let Some(pos) = path.iter().rev().position(f) {
        let index = path.len() - pos - 1;
        path[..index].to_vec()
    } else {
        path.to_vec()
    }
}

/// Creates a single-method visitor that will visit the AST nodes matching the
/// provided path.
///
/// If you pass in `exact`, the visitor will only visit the nodes that match the
/// path exactly. Otherwise, the visitor will visit the closest matching parent
/// node in the path.
///
/// Refer to the [swc_core::ecma::visit::VisitMut] trait for a list of all
/// possible visit methods.
#[macro_export]
macro_rules! create_visitor {
    (exact, $ast_path:expr, $name:ident, |$arg:ident: &mut $ty:ident| $b:block) => {
        $crate::create_visitor!(__ $ast_path.to_vec(), $name, |$arg: &mut $ty| $b)
    };
    ($ast_path:expr, $name:ident, |$arg:ident: &mut $ty:ident| $b:block) => {
        $crate::create_visitor!(__ $crate::code_gen::path_to(&$ast_path, |n| {
            matches!(n, swc_core::ecma::visit::AstParentKind::$ty(_))
        }), $name, |$arg: &mut $ty| $b)
    };
    (__ $ast_path:expr, $name:ident, |$arg:ident: &mut $ty:ident| $b:block) => {{
        struct Visitor<T: Fn(&mut swc_core::ecma::ast::$ty) + Send + Sync> {
            $name: T,
        }

        impl<T: Fn(&mut swc_core::ecma::ast::$ty) + Send + Sync> $crate::code_gen::AstModifier
            for Visitor<T>
        {
            fn $name(&self, $arg: &mut swc_core::ecma::ast::$ty) {
                (self.$name)($arg);
            }
        }

        {
            #[cfg(debug_assertions)]
            if $ast_path.is_empty() {
                unreachable!("if the path is empty, the visitor should be a root visitor");
            }

            (
                $ast_path,
                Box::new(Visitor {
                    $name: move |$arg: &mut swc_core::ecma::ast::$ty| $b,
                }) as Box<dyn $crate::code_gen::AstModifier>,
            )
        }
    }};
}
