use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_tasks::{RcStr, Vc};
use turbopack_core::{
    code_builder::{Code, CodeBuilder},
    context::AssetContext,
    environment::{ChunkLoading, Environment},
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::{asset_context::get_runtime_asset_context, embed_js::embed_static_code};

/// Returns the code for the development ECMAScript runtime.
#[turbo_tasks::function]
pub async fn get_browser_runtime_code(
    environment: Vc<Environment>,
    chunk_base_path: Vc<Option<RcStr>>,
    output_root: Vc<RcStr>,
) -> Result<Vc<Code>> {
    let asset_context = get_runtime_asset_context(environment);

    let shared_runtime_utils_code =
        embed_static_code(asset_context, "shared/runtime-utils.ts".into());
    let runtime_base_code =
        embed_static_code(asset_context, "dev/runtime/base/runtime-base.ts".into());

    let chunk_loading = &*asset_context
        .compile_time_info()
        .environment()
        .chunk_loading()
        .await?;

    let runtime_backend_code = embed_static_code(
        asset_context,
        match chunk_loading {
            ChunkLoading::Edge => "dev/runtime/none/runtime-backend-none.ts".into(),
            ChunkLoading::NodeJs => "dev/runtime/nodejs/runtime-backend-nodejs.ts".into(),
            ChunkLoading::Dom => "dev/runtime/dom/runtime-backend-dom.ts".into(),
        },
    );

    let mut code: CodeBuilder = CodeBuilder::default();
    let output_root = output_root.await?.to_string();
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
            const RUNTIME_PUBLIC_PATH = {};
            const OUTPUT_ROOT = {};
        "#,
        StringifyJs(chunk_base_path),
        StringifyJs(chunk_base_path),
        StringifyJs(output_root.as_str()),
    )?;

    code.push_code(&*shared_runtime_utils_code.await?);
    code.push_code(&*runtime_base_code.await?);

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

    code.push_code(&*runtime_backend_code.await?);

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
