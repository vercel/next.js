use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_ecmascript::{EcmascriptInputTransform, EcmascriptInputTransformsVc};

pub mod module_options_context;
pub mod module_rule;

pub use module_options_context::*;
pub use module_rule::*;

#[turbo_tasks::value(cell = "new", eq = "manual")]
pub struct ModuleOptions {
    pub rules: Vec<ModuleRule>,
}

#[turbo_tasks::value_impl]
impl ModuleOptionsVc {
    #[turbo_tasks::function]
    pub async fn new(
        _path: FileSystemPathVc,
        context: ModuleOptionsContextVc,
    ) -> Result<ModuleOptionsVc> {
        let ModuleOptionsContext {
            enable_react_refresh,
            enable_styled_jsx,
            enable_typescript_transform,
            ..
        } = *context.await?;
        let mut transforms = vec![];

        // Order of transforms is important. e.g. if the React transform occurs before
        // Styled JSX, there won't be JSX nodes for Styled JSX to transform.
        if enable_styled_jsx {
            transforms.push(EcmascriptInputTransform::StyledJsx)
        }
        transforms.push(EcmascriptInputTransform::React {
            refresh: enable_react_refresh,
        });

        let app_transforms = EcmascriptInputTransformsVc::cell(transforms);
        let no_transforms = EcmascriptInputTransformsVc::cell(Vec::new());
        let (ts_transforms, ts_app_transforms) = if enable_typescript_transform {
            (
                EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript]),
                EcmascriptInputTransformsVc::cell(
                    [EcmascriptInputTransform::TypeScript]
                        .into_iter()
                        .chain(app_transforms.await?.iter().cloned())
                        .collect(),
                ),
            )
        } else {
            (no_transforms, app_transforms)
        };
        Ok(ModuleOptionsVc::cell(ModuleOptions {
            rules: vec![
                ModuleRule::new(
                    ModuleRuleCondition::ResourcePathEndsWith(".json".to_string()),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Json)],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::ResourcePathEndsWith(".css".to_string()),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Css)],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::any(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".jsx".to_string()),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                        app_transforms,
                    ))],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::all(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
                        ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                        no_transforms,
                    ))],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::ResourcePathEndsWith(".mjs".to_string()),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                        app_transforms,
                    ))],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::all(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".mjs".to_string()),
                        ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                        no_transforms,
                    ))],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::ResourcePathEndsWith(".cjs".to_string()),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                        app_transforms,
                    ))],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::all(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".cjs".to_string()),
                        ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                        no_transforms,
                    ))],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::any(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".tsx".to_string()),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript(
                        ts_app_transforms,
                    ))],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::all(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
                        ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript(
                        ts_transforms,
                    ))],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::ResourcePathEndsWith(".d.ts".to_string()),
                    vec![ModuleRuleEffect::ModuleType(
                        ModuleType::TypescriptDeclaration(no_transforms),
                    )],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::any(vec![
                        ModuleRuleCondition::ResourcePathEndsWith(".apng".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".avif".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".gif".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".ico".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".jpg".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".jpeg".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".png".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".svg".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".webp".to_string()),
                        ModuleRuleCondition::ResourcePathEndsWith(".woff2".to_string()),
                    ]),
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Static)],
                ),
                ModuleRule::new(
                    ModuleRuleCondition::ResourcePathHasNoExtension,
                    vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(
                        no_transforms,
                    ))],
                ),
            ],
        }))
    }
}
