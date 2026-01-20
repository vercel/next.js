use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    code_builder::{Code, CodeBuilder},
    environment::Environment,
};

use crate::{RuntimeType, asset_context::get_runtime_asset_context, embed_js::embed_static_code};

/// Returns the code for the Node.js ECMAScript runtime.
/// In development mode, includes HMR infrastructure.
/// In production mode, uses a minimal runtime.
#[turbo_tasks::function]
pub async fn get_nodejs_runtime_code(
    environment: ResolvedVc<Environment>,
    runtime_type: RuntimeType,
    generate_source_map: bool,
) -> Result<Vc<Code>> {
    let asset_context = get_runtime_asset_context(*environment).resolve().await?;

    let shared_runtime_utils_code = embed_static_code(
        asset_context,
        rcstr!("shared/runtime-utils.ts"),
        generate_source_map,
    );
    let shared_base_external_utils_code = embed_static_code(
        asset_context,
        rcstr!("shared-node/base-externals-utils.ts"),
        generate_source_map,
    );
    let shared_node_external_utils_code = embed_static_code(
        asset_context,
        rcstr!("shared-node/node-externals-utils.ts"),
        generate_source_map,
    );
    let shared_node_wasm_utils_code = embed_static_code(
        asset_context,
        rcstr!("shared-node/node-wasm-utils.ts"),
        generate_source_map,
    );

    // Use dev runtime (with HMR support) in development, production runtime otherwise
    let runtime_code = match runtime_type {
        RuntimeType::Development => embed_static_code(
            asset_context,
            rcstr!("nodejs/dev-runtime.ts"),
            generate_source_map,
        ),
        RuntimeType::Production => embed_static_code(
            asset_context,
            rcstr!("nodejs/runtime.ts"),
            generate_source_map,
        ),
        #[cfg(feature = "test")]
        RuntimeType::Dummy => {
            panic!("Dummy runtime type is not supported for Node.js runtime")
        }
    };

    let mut code = CodeBuilder::default();
    code.push_code(&*shared_runtime_utils_code.await?);
    code.push_code(&*shared_base_external_utils_code.await?);
    code.push_code(&*shared_node_external_utils_code.await?);
    code.push_code(&*shared_node_wasm_utils_code.await?);
    code.push_code(&*runtime_code.await?);

    Ok(Code::cell(code.build()))
}
