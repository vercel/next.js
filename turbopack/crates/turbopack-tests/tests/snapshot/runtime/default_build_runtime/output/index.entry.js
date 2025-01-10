const CHUNK_PUBLIC_PATH = "output/index.entry.js";
const runtime = require("./[turbopack]_runtime.js");
runtime.loadChunk("output/b1abf_turbopack-tests_tests_snapshot_runtime_default_build_runtime_input_index_ba3c94.js");
runtime.getOrInstantiateRuntimeModule("[project]/turbopack/crates/turbopack-tests/tests/snapshot/runtime/default_build_runtime/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH);
module.exports = runtime.getOrInstantiateRuntimeModule("[project]/turbopack/crates/turbopack-tests/tests/snapshot/runtime/default_build_runtime/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH).exports;