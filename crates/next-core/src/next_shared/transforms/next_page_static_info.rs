use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::page_static_info::{
    collect_exports, extract_exported_const_values, Const,
};
use serde_json::Value;
use swc_core::ecma::ast::Program;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_core::issue::{
    Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString,
};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;
use crate::{next_client::ClientContextType, next_server::ServerContextType};

/// Create a rule to run assertions for the page-static-info.
/// This assertion is partial implementation to the original
/// (analysis/get-page-static-info) Due to not able to bring all the evaluations
/// in the js implementation,
pub fn get_next_page_static_info_assert_rule(
    enable_mdx_rs: bool,
    server_context: Option<ServerContextType>,
    client_context: Option<ClientContextType>,
) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(NextPageStaticInfo {
            server_context,
            client_context,
        }) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: ResolvedVc::cell(vec![transformer]),
            append: ResolvedVc::cell(vec![]),
        }],
    )
}

#[derive(Debug)]
struct NextPageStaticInfo {
    server_context: Option<ServerContextType>,
    client_context: Option<ClientContextType>,
}

#[async_trait]
impl CustomTransformer for NextPageStaticInfo {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_page_static_info", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        if let Some(collected_exports) = collect_exports(program)? {
            let mut properties_to_extract = collected_exports.extra_properties.clone();
            properties_to_extract.insert("config".to_string());

            let extracted = extract_exported_const_values(program, properties_to_extract);

            let is_server_layer_page = matches!(
                self.server_context,
                Some(ServerContextType::AppRSC { .. }) | Some(ServerContextType::AppSSR { .. })
            );

            let is_app_page = is_server_layer_page
                || matches!(self.client_context, Some(ClientContextType::App { .. }));

            if is_server_layer_page {
                for warning in collected_exports.warnings.iter() {
                    PageStaticInfoIssue {
                        file_path: ctx.file_path,
                        messages: vec![
                            format!(
                                "Next.js can't recognize the exported `{}` field in \"{}\" as {}.",
                                warning.key, ctx.file_path_str, warning.message
                            ),
                            "The default runtime will be used instead.".to_string(),
                        ],
                        severity: IssueSeverity::Warning,
                    }
                    .cell()
                    .emit();
                }
            }

            if is_app_page {
                if let Some(Some(Const::Value(Value::Object(config_obj)))) = extracted.get("config")
                {
                    let mut messages = vec![format!(
                        "Page config in {} is deprecated. Replace `export const config=…` with \
                         the following:",
                        ctx.file_path_str
                    )];

                    if let Some(runtime) = config_obj.get("runtime") {
                        messages.push(format!("- `export const runtime = {}`", runtime));
                    }

                    if let Some(regions) = config_obj.get("regions") {
                        messages.push(format!("- `export const preferredRegion = {}`", regions));
                    }

                    messages.push("Visit https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config for more information.".to_string());

                    PageStaticInfoIssue {
                        file_path: ctx.file_path,
                        messages,
                        severity: IssueSeverity::Warning,
                    }
                    .cell()
                    .emit();
                }
            }

            if collected_exports.directives.contains("client")
                && collected_exports.generate_static_params
                && is_app_page
            {
                PageStaticInfoIssue {
                    file_path: ctx.file_path,
                    messages: vec![format!(r#"Page "{}" cannot use both "use client" and export function "generateStaticParams()"."#, ctx.file_path_str)],
                    severity: IssueSeverity::Error,
                }
                .cell()
                .emit();
            }
        }

        Ok(())
    }
}

#[turbo_tasks::value(shared)]
pub struct PageStaticInfoIssue {
    pub file_path: ResolvedVc<FileSystemPath>,
    pub messages: Vec<String>,
    pub severity: IssueSeverity,
}

#[turbo_tasks::value_impl]
impl Issue for PageStaticInfoIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity.into()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Invalid page configuration".into()).cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.file_path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Line(
                self.messages
                    .iter()
                    .map(|v| StyledString::Text(format!("{}\n", v).into()))
                    .collect::<Vec<StyledString>>(),
            )
            .resolved_cell(),
        ))
    }
}
