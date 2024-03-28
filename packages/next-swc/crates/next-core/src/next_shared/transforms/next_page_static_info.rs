use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::page_static_info::collect_exports;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::{
    swc::core::ecma::ast::Program,
    turbopack::{
        core::issue::{
            Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString,
        },
        ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
        turbopack::module_options::{ModuleRule, ModuleRuleEffect},
    },
};

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
    let transformer = EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextPageStaticInfo {
        server_context,
        client_context,
    }) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: Vc::cell(vec![transformer]),
            append: Vc::cell(vec![]),
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
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        if let Some(collected_exports) = collect_exports(program)? {
            let mut properties_to_extract = collected_exports.extra_properties.clone();
            properties_to_extract.insert("config".to_string());

            let is_app_page =
                matches!(
                    self.server_context,
                    Some(ServerContextType::AppRSC { .. }) | Some(ServerContextType::AppSSR { .. })
                ) || matches!(self.client_context, Some(ClientContextType::App { .. }));

            if collected_exports.directives.contains("client")
                && collected_exports.generate_static_params
                && is_app_page
            {
                PageStaticInfoIssue {
                    file_path: ctx.file_path,
                    messages: vec![format!(r#"Page "{}" cannot use both "use client" and export function "generateStaticParams()"."#, ctx.file_path_str)],
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
    pub file_path: Vc<FileSystemPath>,
    pub messages: Vec<String>,
}

#[turbo_tasks::value_impl]
impl Issue for PageStaticInfoIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.into()
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
        self.file_path
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Line(
                self.messages
                    .iter()
                    .map(|v| StyledString::Text(format!("{}\n", v)))
                    .collect::<Vec<StyledString>>(),
            )
            .cell(),
        )))
    }
}
