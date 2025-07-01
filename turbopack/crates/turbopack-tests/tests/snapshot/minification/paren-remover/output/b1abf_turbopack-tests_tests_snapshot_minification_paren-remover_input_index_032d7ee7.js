(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/b1abf_turbopack-tests_tests_snapshot_minification_paren-remover_input_index_032d7ee7.js", {

"[project]/turbopack/crates/turbopack-tests/tests/snapshot/minification/paren-remover/input/index.js [test] (ecmascript)": ((__turbopack_context__) => {

var { m: module, e: exports } = __turbopack_context__;
{
function toFixed(value, maxDecimals1, roundingFunction2, optionals3) {
    var splitValue4 = value.toString().split('.'), minDecimals5 = maxDecimals1 - (optionals3 || 0), optionalsRegExp6, power7, output8;
    var boundedPrecisions9;
    // var unused = 'xxxx';
    // Use the smallest precision value possible to avoid errors from floating point representation
    if (splitValue4.length === 2) {
        boundedPrecisions9 = Math.min(Math.max(splitValue4[1].length, minDecimals5), maxDecimals1);
    } else {
        boundedPrecisions9 = minDecimals5;
    }
    power7 = Math.pow(10, boundedPrecisions9);
    // Multiply up by precision, round accurately, then divide and use native toFixed():
    output8 = (roundingFunction2(value + 'e+' + boundedPrecisions9) / power7).toFixed(boundedPrecisions9);
    if (optionals3 > maxDecimals1 - boundedPrecisions9) {
        optionalsRegExp6 = new RegExp('\\.?0{1,' + (optionals3 - (maxDecimals1 - boundedPrecisions9)) + '}$');
        output8 = output8.replace(optionalsRegExp6, '');
    }
    return output8;
}
toFixed(1.2345, 2, Math.round, 1);
}}),
}]);

//# sourceMappingURL=b1abf_turbopack-tests_tests_snapshot_minification_paren-remover_input_index_032d7ee7.js.map