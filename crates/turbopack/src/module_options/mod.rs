use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_css::{CssInputTransform, CssInputTransformsVc};
use turbopack_ecmascript::{EcmascriptInputTransform, EcmascriptInputTransformsVc};

pub mod module_options_context;
pub mod module_rule;

pub use module_options_context::*;
pub use module_rule::*;

#[turbo_tasks::value(cell = "new", eq = "manual")]
pub struct ModuleOptions {
    pub rules: Vec<ModuleRuleVc>,
}

#[turbo_tasks::value_impl]
impl ModuleOptionsVc {
    #[turbo_tasks::function]
    pub async fn new(
        _path: FileSystemPathVc,
        context: ModuleOptionsContextVc,
    ) -> Result<ModuleOptionsVc> {
        let ModuleOptionsContext {
            enable_emotion,
            enable_react_refresh,
            enable_styled_jsx,
            enable_styled_components,
            enable_typescript_transform,
            preset_env_versions,
            ref custom_ecmascript_app_transforms,
            ref custom_ecmascript_transforms,
            ref custom_rules,
            ..
        } = *context.await?;
        let mut transforms = custom_ecmascript_app_transforms.clone();
        transforms.extend(custom_ecmascript_transforms.iter().cloned());

        // Order of transforms is important. e.g. if the React transform occurs before
        // Styled JSX, there won't be JSX nodes for Styled JSX to transform.
        if enable_styled_jsx {
            transforms.push(EcmascriptInputTransform::StyledJsx)
        }
        if enable_emotion {
            transforms.push(EcmascriptInputTransform::Emotion)
        }
        if enable_styled_components {
            transforms.push(EcmascriptInputTransform::StyledComponents)
        }
        transforms.push(EcmascriptInputTransform::React {
            refresh: enable_react_refresh,
        });

        if let Some(env) = preset_env_versions {
            transforms.push(EcmascriptInputTransform::PresetEnv(env));
        }

        let app_transforms = EcmascriptInputTransformsVc::cell(transforms);
        let vendor_transforms =
            EcmascriptInputTransformsVc::cell(custom_ecmascript_transforms.clone());
        let (ts_app_transforms, ts_transforms) = if enable_typescript_transform {
            let mut base_transforms = vec![EcmascriptInputTransform::TypeScript];
            base_transforms.extend(custom_ecmascript_transforms.iter().cloned());
            (
                EcmascriptInputTransformsVc::cell(
                    base_transforms
                        .iter()
                        .cloned()
                        .chain(app_transforms.await?.iter().cloned())
                        .collect(),
                ),
                EcmascriptInputTransformsVc::cell(base_transforms),
            )
        } else {
            (app_transforms, vendor_transforms)
        };

        let css_transforms = CssInputTransformsVc::cell(vec![CssInputTransform::Nested]);

        let mut rules = vec![
            ModuleRuleVc::new(
                ModuleRuleCondition::ResourcePathEndsWith(".json".to_string()).cell(),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Json).cell()],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::ResourcePathEndsWith(".css".to_string()).cell(),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Css(css_transforms)).cell()],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::ResourcePathEndsWith(".module.css".to_string()).cell(),
                vec![ModuleRuleEffect::ModuleType(ModuleType::CssModule(css_transforms)).cell()],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".jsx".to_string()),
                ])
                .cell(),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(app_transforms)).cell()],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::all(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
                    ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                ])
                .cell(),
                vec![
                    ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(vendor_transforms)).cell(),
                ],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::ResourcePathEndsWith(".mjs".to_string()).cell(),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(app_transforms)).cell()],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::all(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".mjs".to_string()),
                    ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                ])
                .cell(),
                vec![
                    ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(vendor_transforms)).cell(),
                ],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::ResourcePathEndsWith(".cjs".to_string()).cell(),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(app_transforms)).cell()],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::all(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".cjs".to_string()),
                    ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                ])
                .cell(),
                vec![
                    ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(vendor_transforms)).cell(),
                ],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::any(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
                    ModuleRuleCondition::ResourcePathEndsWith(".tsx".to_string()),
                ])
                .cell(),
                vec![
                    ModuleRuleEffect::ModuleType(ModuleType::Typescript(ts_app_transforms)).cell(),
                ],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::all(vec![
                    ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
                    ModuleRuleCondition::ResourcePathInDirectory("node_modules".to_string()),
                ])
                .cell(),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Typescript(ts_transforms)).cell()],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::ResourcePathEndsWith(".d.ts".to_string()).cell(),
                vec![
                    ModuleRuleEffect::ModuleType(ModuleType::TypescriptDeclaration(
                        vendor_transforms,
                    ))
                    .cell(),
                ],
            ),
            ModuleRuleVc::new(
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
                ])
                .cell(),
                vec![ModuleRuleEffect::ModuleType(ModuleType::Static).cell()],
            ),
            ModuleRuleVc::new(
                ModuleRuleCondition::ResourcePathHasNoExtension.cell(),
                vec![
                    ModuleRuleEffect::ModuleType(ModuleType::Ecmascript(vendor_transforms)).cell(),
                ],
            ),
        ];

        rules.extend(custom_rules.iter().copied());

        Ok(ModuleOptionsVc::cell(ModuleOptions { rules }))
    }
}
