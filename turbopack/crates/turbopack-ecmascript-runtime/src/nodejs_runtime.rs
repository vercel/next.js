use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    code_builder::{Code, CodeBuilder},
    context::AssetContext,
    source_map::SourceMapGeneration,
};

use crate::{RuntimeType, embed_js::embed_static_code};

/// Returns the code for the Node.js ECMAScript runtime.
#[turbo_tasks::function]
pub async fn get_nodejs_runtime_code(
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    runtime_type: RuntimeType,
    include_async_module_runtime: bool,
    source_map_generation: SourceMapGeneration,
) -> Result<Vc<Code>> {
    let asset_context = *asset_context;

    let shared_runtime_utils_code = embed_static_code(
        asset_context,
        rcstr!("shared/runtime/runtime-utils.ts"),
        source_map_generation,
    );
    let shared_base_external_utils_code = embed_static_code(
        asset_context,
        rcstr!("shared-node/base-externals-utils.ts"),
        source_map_generation,
    );
    let shared_node_external_utils_code = embed_static_code(
        asset_context,
        rcstr!("shared-node/node-externals-utils.ts"),
        source_map_generation,
    );
    // Runtime base is shared between production and development
    let runtime_base_code = embed_static_code(
        asset_context,
        rcstr!("nodejs/runtime/runtime-base.ts"),
        source_map_generation,
    );

    let mut code = CodeBuilder::new(source_map_generation, false);
    code.push_code(&*shared_runtime_utils_code.await?);
    if include_async_module_runtime {
        code.push_code(
            &*embed_static_code(
                asset_context,
                rcstr!("shared/runtime/async-module.ts"),
                source_map_generation,
            )
            .await?,
        );
    }
    code.push_code(&*shared_base_external_utils_code.await?);
    code.push_code(&*shared_node_external_utils_code.await?);
    code.push_code(&*runtime_base_code.await?);

    match runtime_type {
        RuntimeType::Production => {
            code.push_code(
                &*embed_static_code(
                    asset_context,
                    rcstr!("nodejs/runtime/build-base.ts"),
                    source_map_generation,
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
                    source_map_generation,
                )
                .await?,
            );

            // Include Node.js-specific dev runtime
            code.push_code(
                &*embed_static_code(
                    asset_context,
                    rcstr!("nodejs/runtime/dev-base.ts"),
                    source_map_generation,
                )
                .await?,
            );

            // Include Node.js HMR client (standalone, doesn't use shared ESM client)
            code.push_code(
                &*embed_static_code(
                    asset_context,
                    rcstr!("nodejs/dev/hmr-client.ts"),
                    source_map_generation,
                )
                .await?,
            );

            // Include dev-nodejs (HMR initialization and __turbopack_server_hmr_apply__)
            code.push_code(
                &*embed_static_code(
                    asset_context,
                    rcstr!("nodejs/dev/dev-nodejs.ts"),
                    source_map_generation,
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
