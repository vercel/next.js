use swc_core::ecma::preset_env::Versions;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TaskInput, Vc};

use crate::target::CompileTarget;

pub mod browser;
pub mod edge_worker;
pub mod nodejs;

pub use browser::BrowserEnvironment;
pub use edge_worker::EdgeWorkerEnvironment;
pub use nodejs::{NodeJsEnvironment, NodeJsVersion};

#[turbo_tasks::value]
#[derive(Clone, Copy, Default, Hash, TaskInput, Debug)]
pub enum Rendering {
    #[default]
    None,
    Client,
    Server,
}

impl Rendering {
    pub fn is_none(&self) -> bool {
        matches!(self, Rendering::None)
    }
}

#[turbo_tasks::value]
pub enum ChunkLoading {
    Edge,
    /// CommonJS in Node.js
    NodeJs,
    /// <script> and <link> tags in the browser
    Dom,
}

#[turbo_tasks::value]
pub struct Environment {
    // members must be private to avoid leaking non-custom types
    execution: ResolvedVc<Box<dyn ExecutionEnvironment>>,
}

#[turbo_tasks::value_impl]
impl Environment {
    #[turbo_tasks::function]
    pub fn new(execution: ResolvedVc<Box<dyn ExecutionEnvironment>>) -> Vc<Self> {
        Self::cell(Environment { execution })
    }
}

#[turbo_tasks::value_impl]
impl Environment {
    #[turbo_tasks::function]
    pub fn compile_target(&self) -> Vc<CompileTarget> {
        self.execution.compile_target()
    }

    #[turbo_tasks::function]
    pub fn runtime_versions(&self) -> Vc<RuntimeVersions> {
        self.execution.runtime_versions()
    }

    #[turbo_tasks::function]
    pub fn browserslist_query(&self) -> Vc<RcStr> {
        self.execution.browserslist_query()
    }

    #[turbo_tasks::function]
    pub fn node_externals(&self) -> Vc<bool> {
        self.execution.node_externals()
    }

    #[turbo_tasks::function]
    pub fn supports_esm_externals(&self) -> Vc<bool> {
        self.execution.supports_esm_externals()
    }

    #[turbo_tasks::function]
    pub fn supports_commonjs_externals(&self) -> Vc<bool> {
        self.execution.supports_commonjs_externals()
    }

    #[turbo_tasks::function]
    pub fn supports_wasm(&self) -> Vc<bool> {
        self.execution.supports_wasm()
    }

    #[turbo_tasks::function]
    pub fn resolve_extensions(&self) -> Vc<Vec<RcStr>> {
        self.execution.resolve_extensions()
    }

    #[turbo_tasks::function]
    pub fn resolve_node_modules(&self) -> Vc<bool> {
        self.execution.resolve_node_modules()
    }

    #[turbo_tasks::function]
    pub fn resolve_conditions(&self) -> Vc<Vec<RcStr>> {
        self.execution.resolve_conditions()
    }

    #[turbo_tasks::function]
    pub fn cwd(&self) -> Vc<Option<RcStr>> {
        self.execution.cwd()
    }

    #[turbo_tasks::function]
    pub fn rendering(&self) -> Vc<Rendering> {
        self.execution.rendering()
    }

    #[turbo_tasks::function]
    pub fn chunk_loading(&self) -> Vc<ChunkLoading> {
        self.execution.chunk_loading()
    }
}

#[turbo_tasks::value_trait]
pub trait ExecutionEnvironment {
    #[turbo_tasks::function]
    fn compile_target(&self) -> Vc<CompileTarget>;

    #[turbo_tasks::function]
    fn runtime_versions(&self) -> Vc<RuntimeVersions>;

    #[turbo_tasks::function]
    fn browserslist_query(&self) -> Vc<RcStr>;

    #[turbo_tasks::function]
    fn node_externals(&self) -> Vc<bool>;

    #[turbo_tasks::function]
    fn supports_esm_externals(&self) -> Vc<bool>;

    #[turbo_tasks::function]
    fn supports_commonjs_externals(&self) -> Vc<bool>;

    #[turbo_tasks::function]
    fn supports_wasm(&self) -> Vc<bool>;

    #[turbo_tasks::function]
    fn resolve_extensions(&self) -> Vc<Vec<RcStr>>;

    #[turbo_tasks::function]
    fn resolve_node_modules(&self) -> Vc<bool>;

    #[turbo_tasks::function]
    fn resolve_conditions(&self) -> Vc<Vec<RcStr>>;

    #[turbo_tasks::function]
    fn cwd(&self) -> Vc<Option<RcStr>>;

    #[turbo_tasks::function]
    fn rendering(&self) -> Vc<Rendering>;

    #[turbo_tasks::function]
    fn chunk_loading(&self) -> Vc<ChunkLoading>;
}

// TODO preset_env_base::Version implements Serialize/Deserialize incorrectly
#[turbo_tasks::value(transparent, serialization = "none")]
pub struct RuntimeVersions(#[turbo_tasks(trace_ignore)] pub Versions);
