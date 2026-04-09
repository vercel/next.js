use anyhow::{Result, bail};
use turbo_tasks::{Completion, ResolvedVc, Vc};
use turbopack_core::module_graph::GraphEntries;

use crate::{
    project::Project,
    route::{Endpoint, EndpointOutput, ModuleGraphs},
};

#[turbo_tasks::value]
pub struct EmptyEndpoint {
    project: ResolvedVc<Project>,
}

#[turbo_tasks::value_impl]
impl EmptyEndpoint {
    #[turbo_tasks::function]
    pub fn new(project: ResolvedVc<Project>) -> Vc<Self> {
        EmptyEndpoint { project }.cell()
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

    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }
}
