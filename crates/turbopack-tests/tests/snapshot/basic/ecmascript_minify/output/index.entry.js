const CHUNK_PUBLIC_PATH = "output/index.entry.js";
const runtime = require("./[turbopack]_runtime.js");
runtime.loadChunk("output/crates_turbopack-tests_tests_snapshot_basic_ecmascript_minify_input_index_dc5b16.js");
runtime.getOrInstantiateRuntimeModule("[project]/crates/turbopack-tests/tests/snapshot/basic/ecmascript_minify/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH);
module.exports = runtime.getOrInstantiateRuntimeModule("[project]/crates/turbopack-tests/tests/snapshot/basic/ecmascript_minify/input/index.js [test] (ecmascript)", CHUNK_PUBLIC_PATH).exports;