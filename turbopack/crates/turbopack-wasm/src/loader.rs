use std::fmt::Write;

use anyhow::Result;
use indoc::{formatdoc, writedoc};
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{asset::AssetContent, source::Source, virtual_source::VirtualSource};
use turbopack_ecmascript::utils::StringifyJs;

use crate::{analysis::analyze, source::WebAssemblySource, wasm_edge_var_name};

/// Create a javascript loader to instantiate the WebAssembly module with the
/// necessary imports and exports to be processed by [turbopack_ecmascript].
#[turbo_tasks::function]
pub(crate) async fn instantiating_loader_source(
    source: Vc<WebAssemblySource>,
    is_edge: bool,
) -> Result<Vc<Box<dyn Source>>> {
    let analysis = analyze(source).await?;

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

    writeln!(code, "import {{ instantiate }} from \"WASM_HELPER\";")?;
    writeln!(code, "import wasmPath from \"WASM_PATH\";")?;

    writeln!(code)?;

    // Omitted entirely when `is_edge` is false. As the node and browser
    // implementations do not use this parameter.
    let edge_arg = if is_edge {
        format!(", () => {}", wasm_edge_var_name(Vc::upcast(source)).await?)
    } else {
        String::new()
    };

    writedoc!(
        code,
        r#"
            const {{ {exports} }} = await instantiate(wasmPath, {imports}{edge_arg});

            export {{ {exports} }};
        "#,
        imports = imports_obj,
        edge_arg = edge_arg,
        exports = analysis.exports.join(", "),
    )?;

    let code: RcStr = code.into();

    Ok(Vc::upcast(VirtualSource::new(
        source.ident().await?.path.append("_.loader.mjs")?,
        AssetContent::file(FileContent::Content(File::from(code)).cell()),
    )))
}

/// Create a javascript loader to compile the WebAssembly module and export it
/// without instantiating.
#[turbo_tasks::function]
pub(crate) async fn compiling_loader_source(
    source: Vc<WebAssemblySource>,
    is_edge: bool,
) -> Result<Vc<Box<dyn Source>>> {
    // Omitted entirely when `is_edge` is false. As the node and browser
    // implementations do not use this parameter.
    let edge_arg = if is_edge {
        format!(", () => {}", wasm_edge_var_name(Vc::upcast(source)).await?)
    } else {
        String::new()
    };

    let code: RcStr = formatdoc! {
        r#"
            import {{ compileModule }} from "WASM_HELPER";
            import wasmPath from "WASM_PATH";

            const mod = await compileModule(wasmPath{edge_arg});

            export default mod;
        "#,
        edge_arg = edge_arg,
    }
    .into();

    Ok(Vc::upcast(VirtualSource::new(
        source.ident().await?.path.append("_.loader.mjs")?,
        AssetContent::file(FileContent::Content(File::from(code)).cell()),
    )))
}
