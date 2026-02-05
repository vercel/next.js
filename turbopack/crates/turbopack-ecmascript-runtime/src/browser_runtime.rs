use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::AssetSuffix,
    code_builder::{Code, CodeBuilder},
    context::AssetContext,
    environment::{ChunkLoading, Environment},
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::{RuntimeType, asset_context::get_runtime_asset_context, embed_js::embed_static_code};

/// Returns the code for the ECMAScript runtime.
#[turbo_tasks::function]
pub async fn get_browser_runtime_code(
    environment: ResolvedVc<Environment>,
    chunk_base_path: Vc<Option<RcStr>>,
    asset_suffix: Vc<AssetSuffix>,
    worker_forwarded_globals: Vc<Vec<RcStr>>,
    runtime_type: RuntimeType,
    output_root_to_root_path: RcStr,
    generate_source_map: bool,
    chunk_loading_global: Vc<RcStr>,
) -> Result<Vc<Code>> {
    let asset_context = get_runtime_asset_context(*environment).resolve().await?;

    let shared_runtime_utils_code = embed_static_code(
        asset_context,
        rcstr!("shared/runtime-utils.ts"),
        generate_source_map,
    );

    let mut runtime_base_code = vec!["browser/runtime/base/runtime-base.ts"];
    match runtime_type {
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
    match (chunk_loading, runtime_type) {
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
            runtime_backend_code.push("browser/runtime/dom/runtime-backend-dom.ts");
        }

        #[cfg(feature = "test")]
        (_, RuntimeType::Dummy) => {
            panic!("This configuration is not supported in the browser runtime")
        }
    };

    let mut code: CodeBuilder = CodeBuilder::default();
    let relative_root_path = output_root_to_root_path;
    let chunk_base_path = chunk_base_path.await?;
    let chunk_base_path = chunk_base_path.as_ref().map_or_else(|| "", |f| f.as_str());
    let asset_suffix = asset_suffix.await?;
    let chunk_loading_global = chunk_loading_global.await?;
    let chunk_lists_global = format!("{}_CHUNK_LISTS", &*chunk_loading_global);

    writedoc!(
        code,
        r#"
            (() => {{
            if (!Array.isArray(globalThis[{}])) {{
                return;
            }}

            const CHUNK_BASE_PATH = {};
            const RELATIVE_ROOT_PATH = {};
            const RUNTIME_PUBLIC_PATH = {};
        "#,
        StringifyJs(&chunk_loading_global),
        StringifyJs(chunk_base_path),
        StringifyJs(relative_root_path.as_str()),
        StringifyJs(chunk_base_path),
    )?;

    match &*asset_suffix {
        AssetSuffix::None => {
            writedoc!(
                code,
                r#"
                    const ASSET_SUFFIX = "";
                "#
            )?;
        }
        AssetSuffix::Constant(suffix) => {
            writedoc!(
                code,
                r#"
                    const ASSET_SUFFIX = {};
                "#,
                StringifyJs(suffix.as_str())
            )?;
        }
        AssetSuffix::Inferred => {
            if chunk_loading == &ChunkLoading::Edge {
                panic!("AssetSuffix::Inferred is not supported in Edge runtimes");
            }
            writedoc!(
                code,
                r#"
                    const ASSET_SUFFIX = getAssetSuffixFromScriptSrc();
                "#
            )?;
        }
        AssetSuffix::FromGlobal(global_name) => {
            writedoc!(
                code,
                r#"
                    const ASSET_SUFFIX = globalThis[{}] || "";
                "#,
                StringifyJs(global_name)
            )?;
        }
    }

    // Output the list of global variable names to forward to workers
    let worker_forwarded_globals = worker_forwarded_globals.await?;
    writedoc!(
        code,
        r#"
            const WORKER_FORWARDED_GLOBALS = {};
        "#,
        StringifyJs(&*worker_forwarded_globals)
    )?;

    code.push_code(&*shared_runtime_utils_code.await?);
    for runtime_code in runtime_base_code {
        code.push_code(
            &*embed_static_code(asset_context, runtime_code.into(), generate_source_map).await?,
        );
    }

    if *environment.supports_commonjs_externals().await? {
        code.push_code(
            &*embed_static_code(
                asset_context,
                rcstr!("shared-node/base-externals-utils.ts"),
                generate_source_map,
            )
            .await?,
        );
    }
    if *environment.node_externals().await? {
        code.push_code(
            &*embed_static_code(
                asset_context,
                rcstr!("shared-node/node-externals-utils.ts"),
                generate_source_map,
            )
            .await?,
        );
    }
    if *environment.supports_wasm().await? {
        code.push_code(
            &*embed_static_code(
                asset_context,
                rcstr!("shared-node/node-wasm-utils.ts"),
                generate_source_map,
            )
            .await?,
        );
    }

    for backend_code in runtime_backend_code {
        code.push_code(
            &*embed_static_code(asset_context, backend_code.into(), generate_source_map).await?,
        );
    }

    // Registering chunks and chunk lists depends on the BACKEND variable, which is set by the
    // specific runtime code, hence it must be appended after it.
    writedoc!(
        code,
        r#"
            const chunksToRegister = globalThis[{chunk_loading_global}];
            globalThis[{chunk_loading_global}] = {{ push: registerChunk }};
            chunksToRegister.forEach(registerChunk);
        "#,
        chunk_loading_global = StringifyJs(&chunk_loading_global),
    )?;
    if matches!(runtime_type, RuntimeType::Development) {
        writedoc!(
            code,
            r#"
            const chunkListsToRegister = globalThis[{chunk_lists_global}] || [];
            globalThis[{chunk_lists_global}] = {{ push: registerChunkList }};
            chunkListsToRegister.forEach(registerChunkList);
        "#,
            chunk_lists_global = StringifyJs(&chunk_lists_global),
        )?;
    }
    writedoc!(
        code,
        r#"
            }})();
        "#
    )?;

    Ok(Code::cell(code.build()))
}

/// Returns the code for the ECMAScript worker entrypoint bootstrap.
pub fn get_worker_runtime_code(
    asset_context: Vc<Box<dyn AssetContext>>,
    generate_source_map: bool,
) -> Result<Vc<Code>> {
    Ok(embed_static_code(
        asset_context,
        rcstr!("browser/runtime/base/worker-entrypoint.ts"),
        generate_source_map,
    ))
}
