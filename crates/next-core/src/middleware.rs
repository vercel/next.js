use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{context::AssetContext, module::Module, reference_type::ReferenceType};
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
    let page_path = if is_proxy { "/proxy" } else { "/middleware" };

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
                let has_default = esm_exports.exports.contains_key(&rcstr!("default"));
                let expected_named = if is_proxy {
                    rcstr!("proxy")
                } else {
                    rcstr!("middleware")
                };
                let has_named = esm_exports.exports.contains_key(&expected_named);
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
            let file_type = if is_proxy { "Proxy" } else { "Middleware" };
            let function_name = if is_proxy { "proxy" } else { "middleware" };
            // Extract just the filename for the error message
            let file_name = userland_path
                .path
                .split('/')
                .next_back()
                .unwrap_or(&userland_path.path);
            // Use the same error message format as the runtime check
            bail!(
                "The {} file \"./{}\" must export a function named `{}` or a default function.",
                file_type,
                file_name,
                function_name
            );
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
