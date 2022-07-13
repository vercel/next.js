use swc_ecma_visit::{AstParentKind, VisitMut};
use turbopack_core::chunk::ChunkingContextVc;

use crate::chunk::EcmascriptChunkContextVc;

/// impl of code generation inferred from a AssetReference.
/// This is rust only and can't be implemented by non-rust plugins.
#[turbo_tasks::value(shared, serialization: none, eq: manual, into: new, cell: new)]
pub struct CodeGeneration {
    /// ast nodes matching the span will be visitor by the visitor
    #[trace_ignore]
    pub visitors: Vec<(Vec<AstParentKind>, Box<dyn VisitorFactory>)>,
}

pub trait VisitorFactory: Send + Sync {
    fn create<'a>(&'a self) -> Box<dyn VisitMut + Send + Sync + 'a>;
}

#[turbo_tasks::value_trait]
pub trait CodeGenerateable {
    fn code_generation(
        &self,
        chunk_context: EcmascriptChunkContextVc,
        context: ChunkingContextVc,
    ) -> CodeGenerationVc;
}

#[turbo_tasks::value(transparent)]
pub struct CodeGenerateables(Vec<CodeGenerateableVc>);

#[macro_export]
macro_rules! create_visitor {
    ($ast_path:expr, $name:ident($arg:ident: &mut $ty:ident) $b:block) => {{
        struct Visitor<T: Fn(&mut swc_ecma_ast::$ty) + Send + Sync> {
            $name: T,
        }

        impl<T: Fn(&mut swc_ecma_ast::$ty) + Send + Sync> $crate::code_gen::VisitorFactory
            for Box<Visitor<T>>
        {
            fn create<'a>(&'a self) -> Box<dyn VisitMut + Send + Sync + 'a> {
                box &**self
            }
        }

        impl<'a, T: Fn(&mut swc_ecma_ast::$ty) + Send + Sync> swc_ecma_visit::VisitMut
            for &'a Visitor<T>
        {
            fn $name(&mut self, $arg: &mut swc_ecma_ast::$ty) {
                (self.$name)($arg);
            }
        }

        (
            path_to(&$ast_path, |n| {
                matches!(n, swc_ecma_visit::AstParentKind::$ty(_))
            }),
            box box Visitor {
                $name: move |$arg: &mut swc_ecma_ast::$ty| $b,
            } as Box<dyn $crate::code_gen::VisitorFactory>,
        )
    }};
    (visit_mut_program($arg:ident: &mut Program) $b:block) => {{
        struct Visitor<T: Fn(&mut swc_ecma_ast::Program) + Send + Sync> {
            visit_mut_program: T,
        }

        impl<T: Fn(&mut swc_ecma_ast::Program) + Send + Sync> $crate::code_gen::VisitorFactory
            for Box<Visitor<T>>
        {
            fn create<'a>(&'a self) -> Box<dyn VisitMut + Send + Sync + 'a> {
                box &**self
            }
        }

        impl<'a, T: Fn(&mut swc_ecma_ast::Program) + Send + Sync> swc_ecma_visit::VisitMut
            for &'a Visitor<T>
        {
            fn visit_mut_program(&mut self, $arg: &mut swc_ecma_ast::Program) {
                (self.visit_mut_program)($arg);
            }
        }

        (
            Vec::new(),
            box box Visitor {
                visit_mut_program: move |$arg: &mut swc_ecma_ast::Program| $b,
            } as Box<dyn $crate::code_gen::VisitorFactory>,
        )
    }};
}
