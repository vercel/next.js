use std::path::PathBuf;

use anyhow::Result;
use next_transform_dynamic::{next_dynamic, NextDynamicMode};
use next_transform_strip_page_exports::{next_transform_strip_page_exports, ExportFilter};
use swc_core::{
    common::{util::take::Take, FileName},
    ecma::{
        ast::{Module, ModuleItem, Program},
        atoms::JsWord,
        visit::{FoldWith, VisitMutWith},
    },
};
use turbo_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::{
        core::reference_type::{ReferenceType, UrlReferenceSubType},
        ecmascript::{
            CustomTransformVc, CustomTransformer, EcmascriptInputTransform,
            EcmascriptInputTransformsVc, TransformContext,
        },
        turbopack::module_options::{ModuleRule, ModuleRuleCondition, ModuleRuleEffect},
    },
};

/// Returns a rule which applies the Next.js page export stripping transform.
pub async fn get_next_pages_transforms_rule(
    pages_dir: FileSystemPathVc,
    export_filter: ExportFilter,
) -> Result<ModuleRule> {
    // Apply the Next SSG transform to all pages.
    let strip_transform =
        EcmascriptInputTransform::Custom(CustomTransformVc::cell(box NextJsStripPageExports {
            export_filter,
        }));
    Ok(ModuleRule::new(
        ModuleRuleCondition::all(vec![
            ModuleRuleCondition::all(vec![
                ModuleRuleCondition::ResourcePathInExactDirectory(pages_dir.await?),
                ModuleRuleCondition::not(ModuleRuleCondition::ResourcePathInExactDirectory(
                    pages_dir.join("api").await?,
                )),
                ModuleRuleCondition::not(ModuleRuleCondition::any(vec![
                    // TODO(alexkirsz): Possibly ignore _app as well?
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.js").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.jsx").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.ts").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.tsx").await?),
                ])),
            ]),
            module_rule_match_js_no_url(),
        ]),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![strip_transform]),
        )],
    ))
}

#[derive(Debug)]
struct NextJsStripPageExports {
    export_filter: ExportFilter,
}

impl CustomTransformer for NextJsStripPageExports {
    fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Option<Program> {
        // TODO(alexkirsz) Connect the eliminated_packages to telemetry.
        let eliminated_packages = Default::default();

        let module_program = unwrap_module_program(program);
        Some(
            module_program.fold_with(&mut next_transform_strip_page_exports(
                self.export_filter,
                eliminated_packages,
            )),
        )
    }
}

/// Returns a rule which applies the Next.js dynamic transform.
pub async fn get_next_dynamic_transform_rule(
    is_development: bool,
    is_server: bool,
    is_server_components: bool,
    pages_dir: Option<FileSystemPathVc>,
) -> Result<ModuleRule> {
    let dynamic_transform =
        EcmascriptInputTransform::Custom(CustomTransformVc::cell(box NextJsDynamic {
            is_development,
            is_server,
            is_server_components,
            pages_dir: match pages_dir {
                None => None,
                Some(path) => Some(path.await?.path.clone().into()),
            },
        }));
    Ok(ModuleRule::new(
        module_rule_match_js_no_url(),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![/*dynamic_transform*/]),
        )],
    ))
}

#[derive(Debug)]
struct NextJsDynamic {
    is_development: bool,
    is_server: bool,
    is_server_components: bool,
    pages_dir: Option<PathBuf>,
}

impl CustomTransformer for NextJsDynamic {
    fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Option<Program> {
        let module_program = unwrap_module_program(program);
        Some(module_program.fold_with(&mut next_dynamic(
            self.is_development,
            self.is_server,
            self.is_server_components,
            NextDynamicMode::Turbo,
            FileName::Real(ctx.file_path_str.into()),
            self.pages_dir.clone(),
        )))
    }
}

/// Returns a rule which applies the Next.js font transform.
pub fn get_next_font_transform_rule() -> ModuleRule {
    let font_loaders = vec![
        "next/font/google".into(),
        "@next/font/google".into(),
        "next/font/local".into(),
        "@next/font/local".into(),
    ];

    let transformer =
        EcmascriptInputTransform::Custom(CustomTransformVc::cell(box NextJsFont { font_loaders }));
    ModuleRule::new(
        // TODO: Only match in pages (not pages/api), app/, etc.
        module_rule_match_js_no_url(),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![transformer]),
        )],
    )
}

#[derive(Debug)]
struct NextJsFont {
    font_loaders: Vec<JsWord>,
}

impl CustomTransformer for NextJsFont {
    fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Option<Program> {
        let mut next_font = next_transform_font::next_font_loaders(next_transform_font::Config {
            font_loaders: self.font_loaders.clone(),
            relative_file_path_from_root: ctx.file_name_str.into(),
        });

        program.visit_mut_with(&mut next_font);
        None
    }
}

fn module_rule_match_js_no_url() -> ModuleRuleCondition {
    ModuleRuleCondition::all(vec![
        ModuleRuleCondition::not(ModuleRuleCondition::ReferenceType(ReferenceType::Url(
            UrlReferenceSubType::Undefined,
        ))),
        ModuleRuleCondition::any(vec![
            ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".jsx".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".tsx".to_string()),
        ]),
    ])
}

fn unwrap_module_program(program: &mut Program) -> Program {
    match program {
        Program::Module(module) => Program::Module(module.take()),
        Program::Script(s) => Program::Module(Module {
            span: s.span,
            body: s
                .body
                .iter()
                .map(|stmt| ModuleItem::Stmt(stmt.clone()))
                .collect(),
            shebang: s.shebang.clone(),
        }),
    }
}
