(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/53446_snapshot_basic-tree-shake_dynamic-import-turbopack-exports_input_lib_5a4fbd83.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic-tree-shake/dynamic-import-turbopack-exports/input/lib.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

let dog = 'dog';
dog += '!';
console.log(dog);
function getDog() {
    return dog;
}
dog += '!';
console.log(dog);
function setDog(newDog) {
    dog = newDog;
}
dog += '!';
console.log(dog);
const dogRef = {
    initial: dog,
    get: getDog,
    set: setDog
};
let cat = 'cat';
const initialCat = cat;
function getChimera() {
    return cat + dog;
}
__turbopack_context__.s([
    "cat",
    0,
    cat
]);
}),
]);

//# sourceMappingURL=53446_snapshot_basic-tree-shake_dynamic-import-turbopack-exports_input_lib_5a4fbd83.js.map