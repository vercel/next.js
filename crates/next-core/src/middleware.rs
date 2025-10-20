use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    context::AssetContext,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    module::Module,
    reference_type::ReferenceType,
};
use turbopack_ecmascript::chunk::{EcmascriptChunkPlaceable, EcmascriptExports};

use crate::util::load_next_js_template;

#[turbo_tasks::function]
pub async fn middleware_files(page_extensions: Vc<Vec<RcStr>>) -> Result<Vc<Vec<RcStr>>> {
    let extensions = page_extensions.await?;
    let files = ["middleware.", "src/middleware.", "proxy.", "src/proxy."]
        .into_iter()
        .flat_map(|f| {
            extensions
                .iter()
                .map(move |ext| String::from(f) + ext.as_str())
                .map(RcStr::from)
        })
        .collect();
    Ok(Vc::cell(files))
}

#[turbo_tasks::function]
pub async fn get_middleware_module(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_root: FileSystemPath,
    userland_module: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_MIDDLEWARE_MODULE";

    // Determine if this is a proxy file by checking the module path
    let userland_path = userland_module.ident().path().await?;
    let is_proxy = userland_path.file_stem() == Some("proxy");
    let (file_type, function_name, page_path) = if is_proxy {
        ("Proxy", "proxy", "/proxy")
    } else {
        ("Middleware", "middleware", "/middleware")
    };

    // Validate that the module has the required exports
    if let Some(ecma_module) =
        Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*userland_module).await?
    {
        let exports = ecma_module.get_exports().await?;

        // Check if the module has the required exports
        let has_valid_export = match &*exports {
            // ESM modules - check for named or default export
            EcmascriptExports::EsmExports(esm_exports) => {
                let esm_exports = esm_exports.await?;
                let has_default = esm_exports.exports.contains_key("default");
                let expected_named = function_name;
                let has_named = esm_exports.exports.contains_key(expected_named);
                has_default || has_named
            }
            // CommonJS modules are valid (they can have module.exports or exports.default)
            EcmascriptExports::CommonJs | EcmascriptExports::Value => true,
            // DynamicNamespace might be valid for certain module types
            EcmascriptExports::DynamicNamespace => true,
            // None/Unknown likely indicate parsing errors - skip validation
            // The parsing error will be emitted separately by Turbopack
            EcmascriptExports::None | EcmascriptExports::Unknown => true,
            // EmptyCommonJs is a legitimate case of missing exports
            EcmascriptExports::EmptyCommonJs => false,
        };

        if !has_valid_export {
            MiddlewareMissingExportIssue {
                file_type: file_type.into(),
                function_name: function_name.into(),
                file_path: (*userland_path).clone(),
            }
            .resolved_cell()
            .emit();

            // Continue execution instead of bailing - let the module be processed anyway
            // The runtime template will still catch this at runtime
        }
    }
    // If we can't cast to EcmascriptChunkPlaceable, continue without validation
    // (might be a special module type that doesn't support export checking)

    // Load the file from the next.js codebase.
    let source = load_next_js_template(
        "middleware.js",
        project_root,
        &[
            ("VAR_USERLAND", INNER),
            ("VAR_DEFINITION_PAGE", page_path),
            ("VAR_MODULE_RELATIVE_PATH", userland_path.path.as_str()),
        ],
        &[],
        &[],
    )
    .await?;

    let inner_assets = fxindexmap! {
        rcstr!(INNER) => userland_module
    };

    let module = asset_context
        .process(
            source,
            ReferenceType::Internal(ResolvedVc::cell(inner_assets)),
        )
        .module();

    Ok(module)
}

#[turbo_tasks::value]
struct MiddlewareMissingExportIssue {
    file_type: RcStr,     // "Proxy" or "Middleware"
    function_name: RcStr, // "proxy" or "middleware"
    file_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for MiddlewareMissingExportIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.into()
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.file_path.clone().cell()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        let title_text = format!(
            "{} is missing expected function export name",
            self.file_type
        );

        Ok(StyledString::Text(title_text.into()).cell())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        let type_description = if self.file_type == "Proxy" {
            "proxy (previously called middleware)"
        } else {
            "middleware"
        };

        let migration_bullet = if self.file_type == "Proxy" {
            "- You are migrating from `middleware` to `proxy`, but haven't updated the exported \
             function.\n"
        } else {
            ""
        };

        // Rest of the message goes in description to avoid formatIssue indentation
        let description_text = format!(
            "This function is what Next.js runs for every request handled by this {}.\n\n\
             Why this happens:\n\
             {}\
             - The file exists but doesn't export a function.\n\
             - The export is not a function (e.g., an object or constant).\n\
             - There's a syntax error preventing the export from being recognized.\n\n\
             To fix it:\n\
             - Ensure this file has either a default or \"{}\" function export.\n\n\
             Learn more: https://nextjs.org/docs/messages/middleware-to-proxy",
            type_description,
            migration_bullet,
            self.function_name
        );

        Ok(Vc::cell(Some(
            StyledString::Text(description_text.into()).resolved_cell(),
        )))
    }
}
