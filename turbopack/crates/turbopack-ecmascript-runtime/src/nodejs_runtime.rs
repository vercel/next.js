use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    code_builder::{Code, CodeBuilder},
    environment::Environment,
};

use crate::{RuntimeType, asset_context::get_runtime_asset_context, embed_js::embed_static_code};

/// Returns the code for the Node.js ECMAScript runtime.
#[turbo_tasks::function]
pub async fn get_nodejs_runtime_code(
    environment: ResolvedVc<Environment>,
    runtime_type: RuntimeType,
    generate_source_map: bool,
) -> Result<Vc<Code>> {
    let asset_context = get_runtime_asset_context(*environment).resolve().await?;

    let shared_runtime_utils_code = embed_static_code(
        asset_context,
        rcstr!("shared/runtime/runtime-utils.ts"),
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

    // Runtime base is shared between production and development
    let runtime_base_code = embed_static_code(
        asset_context,
        rcstr!("nodejs/runtime/runtime-base.ts"),
        generate_source_map,
    );

    let mut code = CodeBuilder::default();
    code.push_code(&*shared_runtime_utils_code.await?);
    code.push_code(&*shared_base_external_utils_code.await?);
    code.push_code(&*shared_node_external_utils_code.await?);
    code.push_code(&*shared_node_wasm_utils_code.await?);
    code.push_code(&*runtime_base_code.await?);

    match runtime_type {
        RuntimeType::Production => {
            code.push_code(
                &*embed_static_code(
                    asset_context,
                    rcstr!("nodejs/runtime/build-base.ts"),
                    generate_source_map,
                )
                .await?,
            );
        }
        RuntimeType::Development => {
            // Include shared HMR runtime (includes instantiateModuleShared, etc.)
            code.push_code(
                &*embed_static_code(
                    asset_context,
                    rcstr!("shared/runtime/hmr-runtime.ts"),
                    generate_source_map,
                )
                .await?,
            );

            // Include Node.js-specific dev runtime
            code.push_code(
                &*embed_static_code(
                    asset_context,
                    rcstr!("nodejs/runtime/dev-base.ts"),
                    generate_source_map,
                )
                .await?,
            );

            // Include Node.js HMR client (standalone, doesn't use shared ESM client)
            code.push_code(
                &*embed_static_code(
                    asset_context,
                    rcstr!("nodejs/dev/hmr-client.ts"),
                    generate_source_map,
                )
                .await?,
            );

            // Include dev-nodejs (HMR initialization and __turbopack_server_hmr_apply__)
            code.push_code(
                &*embed_static_code(
                    asset_context,
                    rcstr!("nodejs/dev/dev-nodejs.ts"),
                    generate_source_map,
                )
                .await?,
            );
        }
        #[cfg(feature = "test")]
        RuntimeType::Dummy => {
            panic!("Dummy runtime is not supported in Node.js runtime")
        }
    }

    Ok(Code::cell(code.build()))
}
