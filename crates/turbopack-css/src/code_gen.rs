use swc_core::css::visit::{AstParentKind, VisitMut};
use turbopack_core::chunk::ChunkingContextVc;

/// impl of code generation inferred from a AssetReference.
/// This is rust only and can't be implemented by non-rust plugins.
#[turbo_tasks::value(
    shared,
    serialization = "none",
    eq = "manual",
    into = "new",
    cell = "new"
)]
pub struct CodeGeneration {
    /// ast nodes matching the span will be visitor by the visitor
    #[turbo_tasks(debug_ignore, trace_ignore)]
    pub visitors: Vec<(Vec<AstParentKind>, Box<dyn VisitorFactory>)>,
}

pub trait VisitorFactory: Send + Sync {
    fn create<'a>(&'a self) -> Box<dyn VisitMut + Send + Sync + 'a>;
}

#[turbo_tasks::value_trait]
pub trait CodeGenerateable {
    fn code_generation(&self, context: ChunkingContextVc) -> CodeGenerationVc;
}

#[turbo_tasks::value(transparent)]
pub struct CodeGenerateables(Vec<CodeGenerateableVc>);

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

#[macro_export]
macro_rules! create_visitor {
    (exact $ast_path:expr, $name:ident($arg:ident: &mut $ty:ident) $b:block) => {
        $crate::create_visitor!(__ $ast_path.to_vec(), $name($arg: &mut $ty) $b)
    };
    ($ast_path:expr, $name:ident($arg:ident: &mut $ty:ident) $b:block) => {
        $crate::create_visitor!(__ $crate::code_gen::path_to(&$ast_path, |n| {
            matches!(n, swc_core::css::visit::AstParentKind::$ty(_))
        }), $name($arg: &mut $ty) $b)
    };
    (__ $ast_path:expr, $name:ident($arg:ident: &mut $ty:ident) $b:block) => {{
        struct Visitor<T: Fn(&mut swc_core::css::ast::$ty) + Send + Sync> {
            $name: T,
        }

        impl<T: Fn(&mut swc_core::css::ast::$ty) + Send + Sync> $crate::code_gen::VisitorFactory
            for Box<Visitor<T>>
        {
            fn create<'a>(&'a self) -> Box<dyn swc_core::css::visit::VisitMut + Send + Sync + 'a> {
                Box::new(&**self)
            }
        }

        impl<'a, T: Fn(&mut swc_core::css::ast::$ty) + Send + Sync> swc_core::css::visit::VisitMut
            for &'a Visitor<T>
        {
            fn $name(&mut self, $arg: &mut swc_core::css::ast::$ty) {
                (self.$name)($arg);
            }
        }

        (
            $ast_path,
            Box::new(Box::new(Visitor {
                $name: move |$arg: &mut swc_core::css::ast::$ty| $b,
            })) as Box<dyn $crate::code_gen::VisitorFactory>,
        )
    }};
    (visit_mut_program($arg:ident: &mut Program) $b:block) => {{
        struct Visitor<T: Fn(&mut swc_core::css::ast::Program) + Send + Sync> {
            visit_mut_program: T,
        }

        impl<T: Fn(&mut swc_core::css::ast::Program) + Send + Sync> $crate::code_gen::VisitorFactory
            for Box<Visitor<T>>
        {
            fn create<'a>(&'a self) -> Box<dyn VisitMut + Send + Sync + 'a> {
                Box::new(&**self)
            }
        }

        impl<'a, T: Fn(&mut swc_core::css::ast::Program) + Send + Sync> swc_core::css::visit::VisitMut
            for &'a Visitor<T>
        {
            fn visit_mut_program(&mut self, $arg: &mut swc_core::css::ast::Program) {
                (self.visit_mut_program)($arg);
            }
        }

        (
            Vec::new(),
            Box::new(Box::new(Visitor {
                visit_mut_program: move |$arg: &mut swc_core::css::ast::Program| $b,
            })) as Box<dyn $crate::code_gen::VisitorFactory>,
        )
    }};
}
