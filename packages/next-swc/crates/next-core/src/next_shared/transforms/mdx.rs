use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::{EcmascriptInputTransform, EcmascriptOptions},
    turbopack::module_options::{
        DecoratorsKind, DecoratorsOptions, JsxTransformOptions, MdxTransformOptions, ModuleRule,
        ModuleRuleCondition, ModuleRuleEffect, ModuleType, TypescriptTransformOptions,
    },
};

pub async fn get_mdx_transform_rule(
    jsx_runtime_options: Vc<JsxTransformOptions>,
    mdx_transform_options: Option<Vc<MdxTransformOptions>>,
    tsconfig: Vc<TypescriptTransformOptions>,
    decorator_options: Vc<DecoratorsOptions>,
) -> Result<Option<ModuleRule>> {
    if let Some(mdx_transform_options) = mdx_transform_options {
        let (jsx_runtime, jsx_import_source, development) = {
            let jsx = jsx_runtime_options.await?;
            (
                jsx.runtime.clone(),
                jsx.import_source.clone(),
                jsx.development,
            )
        };

        let decorator_options_value = decorator_options.await?;
        let mdx_transforms = Vc::cell(
            vec![
                Some(EcmascriptInputTransform::TypeScript {
                    use_define_for_class_fields: tsconfig.await?.use_define_for_class_fields,
                }),
                decorator_options_value
                    .decorators_kind
                    .as_ref()
                    .map(|kind| EcmascriptInputTransform::Decorators {
                        is_legacy: kind == &DecoratorsKind::Legacy,
                        is_ecma: kind == &DecoratorsKind::Ecma,
                        emit_decorators_metadata: decorator_options_value.emit_decorators_metadata,
                        use_define_for_class_fields: decorator_options_value
                            .use_define_for_class_fields,
                    }),
            ]
            .into_iter()
            .flatten()
            // TODO previously this also included some more core JS transforms
            // https://github.com/vercel/turbo/blob/c454e35586b9575d264457be562f82982d2468eb/crates/turbopack/src/module_options/mod.rs#L105-L166
            // .chain(transforms.iter().cloned())
            .collect(),
        );

        // TODO merge or overwrite settings in mdx_transform_options?
        let mdx_transform_options_value = mdx_transform_options.await?.clone_value();
        let mdx_transform_options = (MdxTransformOptions {
            development: Some(development),
            jsx: Some(false),
            jsx_runtime,
            jsx_import_source,
            ..mdx_transform_options_value
        })
        .cell();

        Ok(Some(ModuleRule::new(
            ModuleRuleCondition::any(vec![
                ModuleRuleCondition::ResourcePathEndsWith(".md".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".mdx".to_string()),
            ]),
            vec![ModuleRuleEffect::ModuleType(ModuleType::Mdx {
                transforms: mdx_transforms,
                options: mdx_transform_options,
                // TODO where to get actual ecmascript_options from?
                ecmascript_options: EcmascriptOptions::default().cell(),
            })],
        )))
    } else {
        Ok(None)
    }
}
