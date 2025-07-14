export function runExternalSourceMapped(fn) {
    return fn();
}
export function runSetOfSets(setOfSets) {
    setOfSets.forEach((set) => {
        set.forEach((fn) => {
            fn();
        });
    });
}
export function runHiddenSetOfSets(message) {
    runSetOfSets(new Set([new Set([() => console.error(new Error(message))])]));
}
//# sourceMappingURL=sourcemapped.js.map