use turbopack_core::code_builder::{Code, CodeBuilder};

/// Returns the code for the dummy runtime, which is used for snapshots.
pub fn get_dummy_runtime_code() -> Code {
    let mut code = CodeBuilder::default();

    code += "// Dummy runtime\n";

    code.build()
}
