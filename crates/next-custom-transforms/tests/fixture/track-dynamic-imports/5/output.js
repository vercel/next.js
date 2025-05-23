const { ["trackDynamicImport"]: $$trackDynamicImport__ } = require("private-next-rsc-track-dynamic-import");
async function foo() {
    const { foo } = await /*#__PURE__*/ $$trackDynamicImport__(import('some-module'));
    return foo();
}
exports.foo = foo;
