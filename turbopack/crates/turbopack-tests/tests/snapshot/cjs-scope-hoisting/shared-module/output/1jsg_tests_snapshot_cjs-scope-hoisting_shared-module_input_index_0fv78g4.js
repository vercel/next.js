(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_cjs-scope-hoisting_shared-module_input_index_0fv78g4.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/shared-module/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var _names;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/shared-module/input/index.js [test] (ecmascript)
;
var _log, _tag;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/shared-module/input/shared.js [test] (ecmascript)
;
globalThis.__sharedEvaluations = (globalThis.__sharedEvaluations || 0) + 1;
_log = [];
_tag = 'shared';
__turbopack_context__.v({
    log: _log,
    tag: _tag
}, "[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/shared-module/input/shared.js [test] (ecmascript)");
// `./shared` is required by `./a`, by `./b` and here, but its body must only be
// inlined once, at the point of the first require.
const { tag: tag1 } = {
    log: _log,
    tag: _tag
};
var _name;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/shared-module/input/a.js [test] (ecmascript)
;
const { log: log1 } = {
    log: _log,
    tag: _tag
};
log1.push('a');
_name = 'a';
__turbopack_context__.v({
    name: _name
}, "[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/shared-module/input/a.js [test] (ecmascript)");
const a = {
    name: _name
};
var _name1;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/shared-module/input/b.js [test] (ecmascript)
;
const { log: log11 } = {
    log: _log,
    tag: _tag
};
log11.push('b');
_name1 = 'b';
__turbopack_context__.v({
    name: _name1
}, "[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/shared-module/input/b.js [test] (ecmascript)");
const b = {
    name: _name1
};
_names = [
    tag1,
    a.name,
    b.name
];
__turbopack_context__.v({
    names: _names
}, "[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/shared-module/input/index.js [test] (ecmascript)");
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_cjs-scope-hoisting_shared-module_input_index_0fv78g4.js.map