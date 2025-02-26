use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_core::{
    code_builder::{Code, CodeBuilder},
    environment::Environment,
};

use crate::{asset_context::get_runtime_asset_context, embed_js::embed_static_code};

/// Returns the code for the Node.js production ECMAScript runtime.
#[turbo_tasks::function]
pub async fn get_nodejs_runtime_code(
    environment: Vc<Environment>,
    generate_source_map: Vc<bool>,
) -> Result<Vc<Code>> {
    let asset_context = get_runtime_asset_context(environment).await?;

    let shared_runtime_utils_code = embed_static_code(
        asset_context,
        "shared/runtime-utils.ts".into(),
        generate_source_map,
    );
    let shared_base_external_utils_code = embed_static_code(
        asset_context,
        "shared-node/base-externals-utils.ts".into(),
        generate_source_map,
    );
    let shared_node_external_utils_code = embed_static_code(
        asset_context,
        "shared-node/node-externals-utils.ts".into(),
        generate_source_map,
    );
    let shared_node_wasm_utils_code = embed_static_code(
        asset_context,
        "shared-node/node-wasm-utils.ts".into(),
        generate_source_map,
    );
    let runtime_code = embed_static_code(
        asset_context,
        "nodejs/runtime.ts".into(),
        generate_source_map,
    );

    let mut code = CodeBuilder::default();
    code.push_code(&*shared_runtime_utils_code.await?);
    code.push_code(&*shared_base_external_utils_code.await?);
    code.push_code(&*shared_node_external_utils_code.await?);
    code.push_code(&*shared_node_wasm_utils_code.await?);
    code.push_code(&*runtime_code.await?);

    Ok(Code::cell(code.build()))
}
