#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum EsmExternalsConfig {
    #[default]
    None,
    Loose,
    Strict,
}

#[derive(Debug, Clone, Default)]
pub struct ExperimentalConfig {
    pub esm_externals: EsmExternalsConfig,
}

#[derive(Debug, Clone, Default)]
pub struct NextConfigComplete {
    pub experimental: ExperimentalConfig,
    pub bundle_pages_router_dependencies: Option<bool>,
}
