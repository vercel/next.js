const CHUNK_PUBLIC_PATH = "output/index.entry.js";
const runtime = require("./~turbopack_runtime.js");
runtime.loadChunk("output/b1abf_turbopack-tests_tests_snapshot_basic_ecmascript_minify_input_index_a6160e.js");
runtime.getOrInstantiateRuntimeModule("~project/turbopack/crates/turbopack-tests/tests/snapshot/basic/ecmascript_minify/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH);
module.exports = runtime.getOrInstantiateRuntimeModule("~project/turbopack/crates/turbopack-tests/tests/snapshot/basic/ecmascript_minify/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH).exports;