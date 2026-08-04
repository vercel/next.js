use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{AssetSuffix, ChunkLoadRetry, CrossOrigin},
    code_builder::{Code, CodeBuilder},
    context::AssetContext,
    environment::ChunkLoading,
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::{RuntimeType, embed_js::embed_static_code};

/// Returns the code for the ECMAScript runtime.
#[turbo_tasks::function]
pub async fn get_browser_runtime_code(
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    chunk_base_path: Vc<Option<RcStr>>,
    asset_suffix: Vc<AssetSuffix>,
    runtime_type: RuntimeType,
    output_root_to_root_path: RcStr,
    generate_source_map: bool,
    chunk_loading_global: Vc<RcStr>,
    cross_origin: Vc<CrossOrigin>,
    chunk_load_retry: Vc<ChunkLoadRetry>,
    has_async_modules: bool,
    chunk_loading: Vc<ChunkLoading>,
) -> Result<Vc<Code>> {
    let asset_context = *asset_context;
    let environment = asset_context.compile_time_info().environment();

    let shared_runtime_utils_code = embed_static_code(
        asset_context,
        rcstr!("shared/runtime/runtime-utils.ts"),
        generate_source_map,
    );

    let mut runtime_base_code = vec!["browser/runtime/base/runtime-base.ts"];
    match runtime_type {
        RuntimeType::Production => runtime_base_code.push("browser/runtime/base/build-base.ts"),
        RuntimeType::Development => {
            runtime_base_code.push("shared/runtime/hmr-runtime.ts");
            runtime_base_code.push("browser/runtime/base/dev-base.ts");
        }
        #[cfg(feature = "test")]
        RuntimeType::Dummy => {
            panic!("This configuration is not supported in the browser runtime")
        }
    }

    let chunk_loading = &*turbo_tasks::read!(chunk_loading)?;

    let mut runtime_backend_code = vec![];
    match (chunk_loading, runtime_type) {
        // The self-contained backend performs no runtime chunk loading and registers chunks only
        // via `globalThis`/`self` (no DOM).
        (ChunkLoading::Edge | ChunkLoading::SingleChunk, RuntimeType::Development) => {
            runtime_backend_code
                .push("browser/runtime/self-contained/runtime-backend-self-contained.ts");
            runtime_backend_code
                .push("browser/runtime/self-contained/dev-backend-self-contained.ts");
        }
        (ChunkLoading::Edge | ChunkLoading::SingleChunk, RuntimeType::Production) => {
            runtime_backend_code
                .push("browser/runtime/self-contained/runtime-backend-self-contained.ts");
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
    let chunk_base_path = turbo_tasks::read!(chunk_base_path)?;
    let chunk_base_path = chunk_base_path.as_ref().map_or_else(|| "", |f| f.as_str());
    let asset_suffix = turbo_tasks::read!(asset_suffix)?;
    let chunk_loading_global = turbo_tasks::read!(chunk_loading_global)?;
    let cross_origin = *turbo_tasks::read!(cross_origin)?;
    let chunk_lists_global = format!("{}_CHUNK_LISTS", chunk_loading_global);

    if *turbo_tasks::read!(environment.runtime_versions().supports_arrow_functions())? {
        code += "(() => {\n";
    } else {
        code += "(function(){\n";
    }

    writedoc!(
        code,
        r#"
            if (!Array.isArray(globalThis[{}])) {{
                return;
            }}

            var CHUNK_BASE_PATH = {};
            var RELATIVE_ROOT_PATH = {};
            var RUNTIME_PUBLIC_PATH = {};
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
                    var ASSET_SUFFIX = "";
                "#
            )?;
        }
        AssetSuffix::Constant(suffix) => {
            writedoc!(
                code,
                r#"
                    var ASSET_SUFFIX = {};
                "#,
                StringifyJs(suffix.as_str())
            )?;
        }
        AssetSuffix::Inferred => {
            if matches!(
                chunk_loading,
                ChunkLoading::Edge | ChunkLoading::SingleChunk
            ) {
                panic!("AssetSuffix::Inferred is not supported in Edge or single-chunk runtimes");
            }
            writedoc!(
                code,
                r#"
                    var ASSET_SUFFIX = getAssetSuffixFromScriptSrc();
                "#
            )?;
        }
        AssetSuffix::FromGlobal(global_name) => {
            writedoc!(
                code,
                r#"
                    var ASSET_SUFFIX = globalThis[{}] || "";
                "#,
                StringifyJs(global_name)
            )?;
        }
    }

    let cross_origin = cross_origin.as_str();
    writedoc!(
        code,
        r#"
            var CROSS_ORIGIN = {};
        "#,
        StringifyJs(&cross_origin)
    )?;

    // The chunk-load retry policy is owned by the framework (e.g. Next.js) and
    // passed in via the chunking context, so the runtime never hard-codes it.
    let chunk_load_retry = *turbo_tasks::read!(chunk_load_retry)?;
    writedoc!(
        code,
        r#"
            var CHUNK_LOAD_RETRY_MAX_ATTEMPTS = {};
            var CHUNK_LOAD_RETRY_BASE_DELAY_MS = {};
            var CHUNK_LOAD_RETRY_MAX_JITTER_MS = {};
        "#,
        chunk_load_retry.max_retry_attempts,
        chunk_load_retry.base_delay_ms,
        chunk_load_retry.max_jitter_ms,
    )?;

    code.push_code(&*turbo_tasks::read!(shared_runtime_utils_code)?);
    // Only include the async-module (top-level await) machinery when the app uses it.
    if has_async_modules {
        code.push_code(&*turbo_tasks::read!(embed_static_code(
            asset_context,
            rcstr!("shared/runtime/async-module.ts"),
            generate_source_map,
        ))?);
    }
    for runtime_code in runtime_base_code {
        code.push_code(&*turbo_tasks::read!(embed_static_code(
            asset_context,
            runtime_code.into(),
            generate_source_map
        ))?);
    }

    if *turbo_tasks::read!(environment.supports_commonjs_externals())? {
        code.push_code(&*turbo_tasks::read!(embed_static_code(
            asset_context,
            rcstr!("shared-node/base-externals-utils.ts"),
            generate_source_map,
        ))?);
    }
    if *turbo_tasks::read!(environment.node_externals())? {
        code.push_code(&*turbo_tasks::read!(embed_static_code(
            asset_context,
            rcstr!("shared-node/node-externals-utils.ts"),
            generate_source_map,
        ))?);
    }
    for backend_code in runtime_backend_code {
        code.push_code(&*turbo_tasks::read!(embed_static_code(
            asset_context,
            backend_code.into(),
            generate_source_map
        ))?);
    }

    // Registering chunks and chunk lists depends on the BACKEND variable, which is set by the
    // specific runtime code, hence it must be appended after it.
    writedoc!(
        code,
        r#"
            var chunksToRegister = globalThis[{chunk_loading_global}];
            globalThis[{chunk_loading_global}] = {{ push: registerChunk }};
            chunksToRegister.forEach(registerChunk);
        "#,
        chunk_loading_global = StringifyJs(&chunk_loading_global),
    )?;
    if matches!(runtime_type, RuntimeType::Development) {
        writedoc!(
            code,
            r#"
            var chunkListsToRegister = globalThis[{chunk_lists_global}] || [];
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
