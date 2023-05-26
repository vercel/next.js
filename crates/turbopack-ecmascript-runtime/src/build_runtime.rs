use anyhow::Result;
use turbopack_core::{
    code_builder::{CodeBuilder, CodeVc},
    environment::EnvironmentVc,
};
use turbopack_ecmascript::StaticEcmascriptCodeVc;

use crate::{asset_context::get_runtime_asset_context, embed_file_path};

/// Returns the code for the Node.js production ECMAScript runtime.
#[turbo_tasks::function]
pub async fn get_build_runtime_code(environment: EnvironmentVc) -> Result<CodeVc> {
    let asset_context = get_runtime_asset_context(environment);

    let shared_runtime_utils_code =
        StaticEcmascriptCodeVc::new(asset_context, embed_file_path("shared/runtime-utils.ts"))
            .code();

    let runtime_code =
        StaticEcmascriptCodeVc::new(asset_context, embed_file_path("build/runtime.ts")).code();

    let mut code = CodeBuilder::default();
    code.push_code(&*shared_runtime_utils_code.await?);
    code.push_code(&*runtime_code.await?);

    Ok(CodeVc::cell(code.build()))
}
