const CHUNK_PUBLIC_PATH = "output/index.entry.js";
const runtime = require("./[turbopack]_runtime.js");
runtime.loadChunk("output/79fb1_turbopack-tests_tests_snapshot_runtime_default_build_runtime_input_index_e22b2e.js");
runtime.getOrInstantiateRuntimeModule("[project]/crates/turbopack-tests/tests/snapshot/runtime/default_build_runtime/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH);
module.exports = runtime.getOrInstantiateRuntimeModule("[project]/crates/turbopack-tests/tests/snapshot/runtime/default_build_runtime/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH).exports;