use std::fmt::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_tasks::Vc;
use turbo_tasks_fs::File;
use turbopack_core::{asset::AssetContent, source::Source, virtual_source::VirtualSource};
use turbopack_ecmascript::utils::StringifyJs;

use crate::{analysis::analyze, source::WebAssemblySource};

/// Create a javascript loader to instantiate the WebAssembly mode and has the
/// necessary imports and exports to be processed by [turbopack_ecmascript].
#[turbo_tasks::function]
pub(crate) async fn loader_source(source: Vc<WebAssemblySource>) -> Result<Vc<Box<dyn Source>>> {
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

    writeln!(code, "import wasmPath from \"WASM_PATH\";")?;

    writeln!(code)?;

    writedoc!(
        code,
        r#"
            const {{ {exports} }} = await __turbopack_wasm__(wasmPath, {imports});

            export {{ {exports} }};
        "#,
        imports = imports_obj,
        exports = analysis.exports.join(", "),
    )?;

    Ok(Vc::upcast(VirtualSource::new(
        source.ident().path().append("_.loader.mjs".to_string()),
        AssetContent::file(File::from(code).into()),
    )))
}
