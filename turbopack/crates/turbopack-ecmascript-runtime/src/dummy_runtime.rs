use turbopack_core::{
    code_builder::{Code, CodeBuilder},
    source_map::SourceMapGenerationOptions,
};

/// Returns the code for the dummy runtime, which is used for snapshots.
pub fn get_dummy_runtime_code() -> Code {
    let mut code = CodeBuilder::new(false, SourceMapGenerationOptions::NONE);

    code += "// Dummy runtime\n";

    code.build()
}
