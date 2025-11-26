use anyhow::{Result, bail};
use turbo_tasks::{Completion, Vc};
use turbopack_core::module_graph::GraphEntries;

use crate::route::{Endpoint, EndpointOutput, ModuleGraphs};

#[turbo_tasks::value]
pub struct EmptyEndpoint;

#[turbo_tasks::value_impl]
impl EmptyEndpoint {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        EmptyEndpoint.cell()
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for EmptyEndpoint {
    #[turbo_tasks::function]
    fn output(self: Vc<Self>) -> Result<Vc<EndpointOutput>> {
        bail!("Empty endpoint can't have output")
    }

    #[turbo_tasks::function]
    fn server_changed(self: Vc<Self>) -> Vc<Completion> {
        Completion::new()
    }

    #[turbo_tasks::function]
    fn client_changed(self: Vc<Self>) -> Vc<Completion> {
        Completion::new()
    }

    #[turbo_tasks::function]
    fn entries(self: Vc<Self>) -> Vc<GraphEntries> {
        GraphEntries::empty()
    }

    #[turbo_tasks::function]
    fn module_graphs(self: Vc<Self>) -> Vc<ModuleGraphs> {
        Vc::cell(vec![])
    }
}
