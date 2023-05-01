use std::io::Write;

use anyhow::Result;
use turbopack_core::code_builder::{CodeBuilder, CodeVc};
use turbopack_ecmascript::{chunk::EcmascriptChunkItemContentVc, utils::FormatIter};

#[turbo_tasks::function]
pub(super) async fn module_factory(content: EcmascriptChunkItemContentVc) -> Result<CodeVc> {
    let content = content.await?;
    let mut args = vec![
        "r: __turbopack_require__",
        "x: __turbopack_external_require__",
        "f: __turbopack_require_context__",
        "i: __turbopack_import__",
        "s: __turbopack_esm__",
        "v: __turbopack_export_value__",
        "n: __turbopack_export_namespace__",
        "c: __turbopack_cache__",
        "l: __turbopack_load__",
        "j: __turbopack_cjs__",
        "k: __turbopack_refresh__",
        "g: global",
        // HACK
        "__dirname",
    ];
    if content.options.module {
        args.push("m: module");
    }
    if content.options.exports {
        args.push("e: exports");
    }
    let mut code = CodeBuilder::default();
    let args = FormatIter(|| args.iter().copied().intersperse(", "));
    if content.options.this {
        write!(code, "(function({{ {} }}) {{ !function() {{\n\n", args,)?;
    } else {
        write!(code, "(({{ {} }}) => (() => {{\n\n", args,)?;
    }

    let source_map = content.source_map.map(|sm| sm.as_generate_source_map());
    code.push_source(&content.inner_code, source_map);
    if content.options.this {
        code += "\n}.call(this) })";
    } else {
        code += "\n})())";
    }
    Ok(code.build().cell())
}
