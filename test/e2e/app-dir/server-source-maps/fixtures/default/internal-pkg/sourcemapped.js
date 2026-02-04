export function runInternalSourceMapped(fn) {
    return fn();
}
export function runSetOfSets(setOfSets) {
    setOfSets.forEach((set) => {
        set.forEach((fn) => {
            fn();
        });
    });
}
export function runHiddenSetOfSets() {
    runSetOfSets(new Set([new Set([() => console.error(new Error('ignore-listed frames'))])]));
}
//# sourceMappingURL=sourcemapped.js.map