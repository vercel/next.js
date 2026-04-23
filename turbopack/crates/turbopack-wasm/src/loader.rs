use std::fmt::Write;

use anyhow::Result;
use indoc::{formatdoc, writedoc};
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::AssetContent, context::AssetContext, environment::ChunkLoading, source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::{analysis::analyze, source::WebAssemblySource, wasm_edge_var_name};

/// Determines the `@turbopack/wasm-*` module name based on the environment.
async fn wasm_module_name(asset_context: Vc<Box<dyn AssetContext>>) -> Result<&'static str> {
    let environment = asset_context.compile_time_info().environment();
    let chunk_loading = &*environment.chunk_loading().await?;
    Ok(match chunk_loading {
        ChunkLoading::NodeJs => "@turbopack/wasm-node",
        ChunkLoading::Edge => "@turbopack/wasm-edge",
        ChunkLoading::Dom => "@turbopack/wasm-dom",
    })
}

/// Create a javascript loader to instantiate the WebAssembly module with the
/// necessary imports and exports to be processed by [turbopack_ecmascript].
#[turbo_tasks::function]
pub(crate) async fn instantiating_loader_source(
    source: Vc<WebAssemblySource>,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<Box<dyn Source>>> {
    let analysis = analyze(source).await?;
    let wasm_module = wasm_module_name(asset_context).await?;

    let mut code = String::new();

    let mut imports_obj = "{".to_string();
    for (path, items) in &analysis.imports {
        writeln!(
            code,
            "import {{ {} }} from {};",
            items.join(", "),
            StringifyJs(path)
        )?;

        writeln!(imports_obj, "\n    {}: {{", StringifyJs(path))?;
        for item in items {
            writeln!(imports_obj, "        {}: {},", StringifyJs(item), item)?;
        }
        writeln!(imports_obj, "    }},")?;
    }
    writeln!(imports_obj, "}}")?;

    writeln!(
        code,
        "import {{ instantiateWebAssembly }} from {:?};",
        wasm_module
    )?;
    writeln!(code, "import wasmPath from \"WASM_PATH\";")?;

    writeln!(code)?;

    writedoc!(
        code,
        r#"
            const {{ {exports} }} = await instantiateWebAssembly(wasmPath, () => {edgeVariable}, {imports});

            export {{ {exports} }};
        "#,
        edgeVariable = wasm_edge_var_name(Vc::upcast(source)).await?,
        imports = imports_obj,
        exports = analysis.exports.join(", "),
    )?;

    let code: RcStr = code.into();

    Ok(Vc::upcast(VirtualSource::new(
        source.ident().path().await?.append("_.loader.mjs")?,
        AssetContent::file(FileContent::Content(File::from(code)).cell()),
    )))
}

/// Create a javascript loader to compile the WebAssembly module and export it
/// without instantiating.
#[turbo_tasks::function]
pub(crate) async fn compiling_loader_source(
    source: Vc<WebAssemblySource>,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<Box<dyn Source>>> {
    let wasm_module = wasm_module_name(asset_context).await?;

    let code: RcStr = formatdoc! {
        r#"
            import {{ compileWebAssembly }} from {:?};
            import wasmPath from "WASM_PATH";

            const mod = await compileWebAssembly(wasmPath, () => {edgeVariable});

            export default mod;
        "#,
        wasm_module,
        edgeVariable = wasm_edge_var_name(Vc::upcast(source)).await?
    }
    .into();

    Ok(Vc::upcast(VirtualSource::new(
        source.ident().path().await?.append("_.loader.mjs")?,
        AssetContent::file(FileContent::Content(File::from(code)).cell()),
    )))
}
