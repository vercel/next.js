use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    common::comments::NoopComments,
    ecma::{ast::Program, atoms::Atom},
};
use turbo_tasks::{ValueDefault, Vc};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[turbo_tasks::value(shared, operation)]
#[derive(Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct StyledComponentsTransformConfig {
    pub display_name: bool,
    pub ssr: bool,
    pub file_name: bool,
    pub top_level_import_paths: Vec<String>,
    pub meaningless_file_names: Vec<String>,
    pub css_prop: bool,
    pub namespace: Option<String>,
}

impl Default for StyledComponentsTransformConfig {
    fn default() -> Self {
        StyledComponentsTransformConfig {
            display_name: true,
            ssr: true,
            file_name: true,
            top_level_import_paths: vec![],
            meaningless_file_names: vec!["index".to_string()],
            css_prop: true,
            namespace: None,
        }
    }
}

#[turbo_tasks::value_impl]
impl StyledComponentsTransformConfig {
    #[turbo_tasks::function]
    fn default_private() -> Vc<Self> {
        Self::cell(Default::default())
    }
}

impl ValueDefault for StyledComponentsTransformConfig {
    fn value_default() -> Vc<Self> {
        StyledComponentsTransformConfig::default_private()
    }
}

#[derive(Debug)]
pub struct StyledComponentsTransformer {
    config: styled_components::Config,
}

impl StyledComponentsTransformer {
    pub fn new(config: &StyledComponentsTransformConfig) -> Self {
        let mut options = styled_components::Config {
            display_name: config.display_name,
            ssr: config.ssr,
            file_name: config.file_name,
            css_prop: config.css_prop,
            ..Default::default()
        };

        if let Some(namespace) = &config.namespace {
            options.namespace.clone_from(namespace);
        }

        let top_level_import_paths = &config.top_level_import_paths;
        if !top_level_import_paths.is_empty() {
            options.top_level_import_paths = top_level_import_paths
                .iter()
                .map(|s| Atom::from(s.clone()))
                .collect();
        }
        let meaningless_file_names = &config.meaningless_file_names;
        if !meaningless_file_names.is_empty() {
            options
                .meaningless_file_names
                .clone_from(meaningless_file_names);
        }

        Self { config: options }
    }
}

#[async_trait]
impl CustomTransformer for StyledComponentsTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "styled_components", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(styled_components::styled_components(
            Some(ctx.file_path_str),
            ctx.file_name_hash,
            &self.config,
            NoopComments,
        ));

        Ok(())
    }
}
