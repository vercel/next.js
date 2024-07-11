use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::{source::Source, source_transform::SourceTransform},
    node::{
        execution_context::ExecutionContext,
        transforms::postcss::{PostCssTransform, PostCssTransformOptions},
    },
    turbopack::{
        evaluate_context::node_evaluate_asset_context,
        module_options::{
            package_import_map_from_context, package_import_map_from_import_mapping, ModuleRule,
            ModuleRuleCondition, ModuleRuleEffect,
        },
    },
};

#[turbo_tasks::value]
pub struct PostCssWrapperTransform {
    execution_context: Vc<ExecutionContext>,
    transform_options: Vc<PostCssTransformOptions>,
}

#[turbo_tasks::value_impl]
impl PostCssWrapperTransform {
    #[turbo_tasks::function]
    pub fn new(
        execution_context: Vc<ExecutionContext>,
        transform_options: Vc<PostCssTransformOptions>,
    ) -> Vc<Self> {
        PostCssWrapperTransform {
            execution_context,
            transform_options,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl SourceTransform for PostCssWrapperTransform {
    #[turbo_tasks::function]
    async fn transform(self: Vc<Self>, source: Vc<Box<dyn Source>>) -> Result<Vc<Box<dyn Source>>> {
        let this = self.await?;
        let transform_options = this.transform_options.await?;

        let import_map = if let Some(postcss_package) = transform_options.postcss_package {
            package_import_map_from_import_mapping("postcss".into(), postcss_package)
        } else {
            let path = source.ident().path();
            package_import_map_from_context("postcss".into(), path)
        };

        let evaluate_context = node_evaluate_asset_context(
            this.execution_context,
            Some(import_map),
            None,
            "postcss".into(),
        );

        Ok(PostCssTransform::new(
            evaluate_context,
            this.execution_context,
            transform_options.config_location,
        )
        .transform(source))
    }
}

pub async fn get_postcss_transform_rule(
    execution_context: Vc<ExecutionContext>,
    transform_options: Vc<PostCssTransformOptions>,
) -> Result<Option<ModuleRule>> {
    Ok(Some(ModuleRule::new(
        ModuleRuleCondition::ResourcePathEndsWith(".css".to_string()),
        vec![ModuleRuleEffect::SourceTransforms(Vc::cell(vec![
            Vc::upcast(PostCssWrapperTransform::new(
                execution_context,
                transform_options,
            )),
        ]))],
    )))
}
