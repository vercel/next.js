(()=>{"use strict";(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_reexport-registration_mixed-encoding_input_1rptxwi6ak5m1._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/reexport-registration/mixed-encoding/input/first.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "b",
    ()=>b,
    "has,comma",
    ()=>comma
]);
const comma = 'comma-value';
const b = 'b-value';
;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/reexport-registration/mixed-encoding/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// The first group contains a comma and needs pair encoding. The second is
// comma-free and should still use compact encoding in the same registration.
__turbopack_context__.S([
    "[project]/turbopack/crates/turbopack-tests/tests/snapshot/reexport-registration/mixed-encoding/input/first.js [test] (ecmascript)",
    "b",
    "b",
    "has,comma",
    "has,comma",
    0,
    "[project]/turbopack/crates/turbopack-tests/tests/snapshot/reexport-registration/mixed-encoding/input/second.js [test] (ecmascript)",
    "c,c"
]);
;
;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/reexport-registration/mixed-encoding/input/second.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "c",
    ()=>c
]);
const c = 'c-value';
}),
]);})()

//# sourceMappingURL=1jsg_tests_snapshot_reexport-registration_mixed-encoding_input_1rptxwi6ak5m1._.js.map