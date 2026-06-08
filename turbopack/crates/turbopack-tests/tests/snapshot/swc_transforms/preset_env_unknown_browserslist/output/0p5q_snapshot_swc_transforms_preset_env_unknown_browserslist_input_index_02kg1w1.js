(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/0p5q_snapshot_swc_transforms_preset_env_unknown_browserslist_input_index_02kg1w1.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/swc_transforms/preset_env_unknown_browserslist/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// When browserslist-rs can't resolve the target (e.g. "chrome 99999"),
// preset-env should treat it as `unknown_version` instead of enabling every
// transform. Without the fix this panics: the generator transform has a
// todo!() for **.
async function compute() {
    return 10n ** 18n;
}
console.log(compute());
const __TURBOPACK__default__export__ = 123;
}),
]);

//# sourceMappingURL=0p5q_snapshot_swc_transforms_preset_env_unknown_browserslist_input_index_02kg1w1.js.map