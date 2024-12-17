use serde::{Deserialize, Serialize};
use swc_core::ecma::{
    ast::Stmt,
    visit::{AstParentKind, VisitMut},
};
use turbo_rcstr::RcStr;
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, ResolvedVc, Vc};
use turbopack_core::chunk::{AsyncModuleInfo, ChunkingContext};

/// impl of code generation inferred from a ModuleReference.
/// This is rust only and can't be implemented by non-rust plugins.
#[turbo_tasks::value(
    shared,
    serialization = "none",
    eq = "manual",
    into = "new",
    cell = "new"
)]
#[derive(Default)]
pub struct CodeGeneration {
    /// ast nodes matching the span will be visitor by the visitor
    #[turbo_tasks(debug_ignore, trace_ignore)]
    pub visitors: Vec<(Vec<AstParentKind>, Box<dyn VisitorFactory>)>,
    pub hoisted_stmts: Vec<CodeGenerationHoistedStmt>,
    pub early_hoisted_stmts: Vec<CodeGenerationHoistedStmt>,
}

impl CodeGeneration {
    pub fn empty() -> Vc<Self> {
        CodeGeneration {
            ..Default::default()
        }
        .cell()
    }

    pub fn new(
        visitors: Vec<(Vec<AstParentKind>, Box<dyn VisitorFactory>)>,
        hoisted_stmts: Vec<CodeGenerationHoistedStmt>,
        early_hoisted_stmts: Vec<CodeGenerationHoistedStmt>,
    ) -> Vc<Self> {
        CodeGeneration {
            visitors,
            hoisted_stmts,
            early_hoisted_stmts,
        }
        .cell()
    }

    pub fn visitors(visitors: Vec<(Vec<AstParentKind>, Box<dyn VisitorFactory>)>) -> Vc<Self> {
        CodeGeneration {
            visitors,
            ..Default::default()
        }
        .cell()
    }

    pub fn hoisted_stmt(key: RcStr, stmt: Stmt) -> Vc<Self> {
        CodeGeneration {
            hoisted_stmts: vec![CodeGenerationHoistedStmt::new(key, stmt)],
            ..Default::default()
        }
        .cell()
    }

    pub fn hoisted_stmts(hoisted_stmts: Vec<CodeGenerationHoistedStmt>) -> Vc<Self> {
        CodeGeneration {
            hoisted_stmts,
            ..Default::default()
        }
        .cell()
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct CodeGenerationHoistedStmt {
    pub key: RcStr,
    #[turbo_tasks(trace_ignore)]
    pub stmt: Stmt,
}

impl CodeGenerationHoistedStmt {
    pub fn new(key: RcStr, stmt: Stmt) -> Self {
        CodeGenerationHoistedStmt { key, stmt }
    }
}

pub trait VisitorFactory: Send + Sync {
    fn create<'a>(&'a self) -> Box<dyn VisitMut + Send + Sync + 'a>;
}

#[turbo_tasks::value_trait(local)]
pub trait CodeGenerateable {
    fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<CodeGeneration>;
}

#[turbo_tasks::value_trait]
pub trait CodeGenerateableWithAsyncModuleInfo {
    fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<CodeGeneration>;
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat)]
pub enum CodeGen {
    CodeGenerateable(Vc<Box<dyn CodeGenerateable>>),
    CodeGenerateableWithAsyncModuleInfo(ResolvedVc<Box<dyn CodeGenerateableWithAsyncModuleInfo>>),
}

#[turbo_tasks::value(transparent, local)]
pub struct CodeGenerateables(Vec<CodeGen>);

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
    // This rule needs to be first, otherwise we run into the following error:
    // expected one of `!`, `)`, `,`, `.`, `::`, `?`, `{`, or an operator, found `:`
    // This is a regression on nightly.
    (visit_mut_program($arg:ident: &mut Program) $b:block) => {{
        struct Visitor<T: Fn(&mut swc_core::ecma::ast::Program) + Send + Sync> {
            visit_mut_program: T,
        }

        impl<T: Fn(&mut swc_core::ecma::ast::Program) + Send + Sync> $crate::code_gen::VisitorFactory
            for Box<Visitor<T>>
        {
            fn create<'a>(&'a self) -> Box<dyn swc_core::ecma::visit::VisitMut + Send + Sync + 'a> {
                Box::new(&**self)
            }
        }

        impl<'a, T: Fn(&mut swc_core::ecma::ast::Program) + Send + Sync> swc_core::ecma::visit::VisitMut
            for &'a Visitor<T>
        {
            fn visit_mut_program(&mut self, $arg: &mut swc_core::ecma::ast::Program) {
                (self.visit_mut_program)($arg);
            }
        }

        (
            Vec::new(),
            Box::new(Box::new(Visitor {
                visit_mut_program: move |$arg: &mut swc_core::ecma::ast::Program| $b,
            })) as Box<dyn $crate::code_gen::VisitorFactory>,
        )
    }};
    (exact $ast_path:expr, $name:ident($arg:ident: &mut $ty:ident) $b:block) => {
        $crate::create_visitor!(__ $ast_path.to_vec(), $name($arg: &mut $ty) $b)
    };
    ($ast_path:expr, $name:ident($arg:ident: &mut $ty:ident) $b:block) => {
        $crate::create_visitor!(__ $crate::code_gen::path_to(&$ast_path, |n| {
            matches!(n, swc_core::ecma::visit::AstParentKind::$ty(_))
        }), $name($arg: &mut $ty) $b)
    };
    (__ $ast_path:expr, $name:ident($arg:ident: &mut $ty:ident) $b:block) => {{
        struct Visitor<T: Fn(&mut swc_core::ecma::ast::$ty) + Send + Sync> {
            $name: T,
        }

        impl<T: Fn(&mut swc_core::ecma::ast::$ty) + Send + Sync> $crate::code_gen::VisitorFactory
            for Box<Visitor<T>>
        {
            fn create<'a>(&'a self) -> Box<dyn swc_core::ecma::visit::VisitMut + Send + Sync + 'a> {
                Box::new(&**self)
            }
        }

        impl<'a, T: Fn(&mut swc_core::ecma::ast::$ty) + Send + Sync> swc_core::ecma::visit::VisitMut
            for &'a Visitor<T>
        {
            fn $name(&mut self, $arg: &mut swc_core::ecma::ast::$ty) {
                (self.$name)($arg);
            }
        }

        (
            $ast_path,
            Box::new(Box::new(Visitor {
                $name: move |$arg: &mut swc_core::ecma::ast::$ty| $b,
            })) as Box<dyn $crate::code_gen::VisitorFactory>,
        )
    }};
}
