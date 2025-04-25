const { ["trackDynamicImport"]: $$trackDynamicImport__ } = require("private-next-rsc-track-dynamic-import");
async function foo() {
    await /*#__PURE__*/ $$trackDynamicImport__(import('./some-file'));
    return null;
}
exports.foo = foo;
