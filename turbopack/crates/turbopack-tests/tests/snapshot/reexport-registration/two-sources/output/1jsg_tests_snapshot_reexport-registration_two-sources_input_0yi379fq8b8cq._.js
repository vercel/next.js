(()=>{"use strict";(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_reexport-registration_two-sources_input_0yi379fq8b8cq._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/reexport-registration/two-sources/input/first.js [test] (ecmascript)", ((__turbopack_context__) => {

__turbopack_context__.s([
    "a",
    ()=>a,
    "b",
    ()=>b
]);
const a = 'a-value';
const b = 'b-value';
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/reexport-registration/two-sources/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {

// Two source modules, so the registration needs a second group -- and therefore
// the `0` separator between them.
__turbopack_context__.S([
    "[project]/turbopack/crates/turbopack-tests/tests/snapshot/reexport-registration/two-sources/input/first.js [test] (ecmascript)",
    "a,a,b,b",
    0,
    "[project]/turbopack/crates/turbopack-tests/tests/snapshot/reexport-registration/two-sources/input/second.js [test] (ecmascript)",
    "c,c"
]);
;
;
;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/reexport-registration/two-sources/input/second.js [test] (ecmascript)", ((__turbopack_context__) => {

__turbopack_context__.s([
    "c",
    ()=>c
]);
const c = 'c-value';
}),
]);})()

//# sourceMappingURL=1jsg_tests_snapshot_reexport-registration_two-sources_input_0yi379fq8b8cq._.js.map