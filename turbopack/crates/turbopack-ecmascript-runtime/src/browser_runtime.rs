use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_rcstr::RcStr;
use turbo_tasks::{Value, Vc};
use turbopack_core::{
    code_builder::{Code, CodeBuilder},
    context::AssetContext,
    environment::{ChunkLoading, Environment},
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::{asset_context::get_runtime_asset_context, embed_js::embed_static_code, RuntimeType};

/// Returns the code for the ECMAScript runtime.
#[turbo_tasks::function]
pub async fn get_browser_runtime_code(
    environment: Vc<Environment>,
    chunk_base_path: Vc<Option<RcStr>>,
    runtime_type: Value<RuntimeType>,
    output_root_to_root_path: Vc<RcStr>,
) -> Result<Vc<Code>> {
    let asset_context = get_runtime_asset_context(environment).await?;

    let shared_runtime_utils_code =
        embed_static_code(asset_context, "shared/runtime-utils.ts".into());

    let mut runtime_base_code = vec!["browser/runtime/base/runtime-base.ts"];
    match *runtime_type {
        RuntimeType::Production => runtime_base_code.push("browser/runtime/base/build-base.ts"),
        RuntimeType::Development => {
            runtime_base_code.push("browser/runtime/base/dev-base.ts");
        }
        #[cfg(feature = "test")]
        RuntimeType::Dummy => {
            panic!("This configuration is not supported in the browser runtime")
        }
    }

    let chunk_loading = &*asset_context
        .compile_time_info()
        .environment()
        .chunk_loading()
        .await?;

    let mut runtime_backend_code = vec![];
    match (chunk_loading, *runtime_type) {
        (ChunkLoading::Edge, RuntimeType::Development) => {
            runtime_backend_code.push("browser/runtime/edge/runtime-backend-edge.ts");
            runtime_backend_code.push("browser/runtime/edge/dev-backend-edge.ts");
        }
        (ChunkLoading::Edge, RuntimeType::Production) => {
            runtime_backend_code.push("browser/runtime/edge/runtime-backend-edge.ts");
        }
        // This case should never be hit.
        (ChunkLoading::NodeJs, _) => {
            panic!("Node.js runtime is not supported in the browser runtime!")
        }
        (ChunkLoading::Dom, RuntimeType::Development) => {
            runtime_backend_code.push("browser/runtime/dom/runtime-backend-dom.ts");
            runtime_backend_code.push("browser/runtime/dom/dev-backend-dom.ts");
        }
        (ChunkLoading::Dom, RuntimeType::Production) => {
            // TODO
            runtime_backend_code.push("browser/runtime/dom/runtime-backend-dom.ts");
        }

        #[cfg(feature = "test")]
        (_, RuntimeType::Dummy) => {
            panic!("This configuration is not supported in the browser runtime")
        }
    };

    let mut code: CodeBuilder = CodeBuilder::default();
    let relative_root_path = output_root_to_root_path.await?;
    let chunk_base_path = &*chunk_base_path.await?;
    let chunk_base_path = chunk_base_path.as_ref().map_or_else(|| "", |f| f.as_str());

    writedoc!(
        code,
        r#"
            (() => {{
            if (!Array.isArray(globalThis.TURBOPACK)) {{
                return;
            }}

            const CHUNK_BASE_PATH = {};
            const RELATIVE_ROOT_PATH = {};
            const RUNTIME_PUBLIC_PATH = {};
        "#,
        StringifyJs(chunk_base_path),
        StringifyJs(relative_root_path.as_str()),
        StringifyJs(chunk_base_path),
    )?;

    code.push_code(&*shared_runtime_utils_code.await?);
    for runtime_code in runtime_base_code {
        code.push_code(&*embed_static_code(asset_context, runtime_code.into()).await?);
    }

    if *environment.supports_commonjs_externals().await? {
        code.push_code(
            &*embed_static_code(asset_context, "shared-node/base-externals-utils.ts".into())
                .await?,
        );
    }
    if *environment.node_externals().await? {
        code.push_code(
            &*embed_static_code(asset_context, "shared-node/node-externals-utils.ts".into())
                .await?,
        );
    }
    if *environment.supports_wasm().await? {
        code.push_code(
            &*embed_static_code(asset_context, "shared-node/node-wasm-utils.ts".into()).await?,
        );
    }

    for backend_code in runtime_backend_code {
        code.push_code(&*embed_static_code(asset_context, backend_code.into()).await?);
    }

    // Registering chunks depends on the BACKEND variable, which is set by the
    // specific runtime code, hence it must be appended after it.
    writedoc!(
        code,
        r#"
            const chunksToRegister = globalThis.TURBOPACK;
            globalThis.TURBOPACK = {{ push: registerChunk }};
            chunksToRegister.forEach(registerChunk);
            }})();
        "#
    )?;

    Ok(Code::cell(code.build()))
}
