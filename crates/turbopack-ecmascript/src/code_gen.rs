use swc_common::Span;
use swc_ecmascript::visit::VisitMut;

/// impl of code generation inferred from a AssetReference.
/// This is rust only and can't be implemented by non-rust plugins.
#[turbo_tasks::value(shared, serialization: none, eq: manual, into: new, cell: new)]
pub struct CodeGeneration {
    /// ast nodes matching the span will be visitor by the visitor
    #[trace_ignore]
    pub visitors: Vec<(Span, Box<dyn Send + Sync + Fn() -> Visitor>)>,
}

pub type Visitor = Box<dyn VisitMut + Send + Sync>;

#[turbo_tasks::value_trait]
pub trait CodeGenerationReference {
    fn code_generation(&self) -> CodeGenerationVc;
}
