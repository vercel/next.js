use turbopack_binding::swc::core::ecma::visit::Visit;

pub struct Optimizer {
    data: Data,
}

struct Analyzer<'a> {
    data: &'a mut Data,
}

#[derive(Debug, Default)]
struct Data {}
