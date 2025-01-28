import { trackDynamicImport as $$trackDynamicImport__ } from "private-next-rsc-track-dynamic-import";
export default async function Page() {
    const { foo } = await /*#__PURE__*/ $$trackDynamicImport__(import('some-module'));
    // name conflict
    $$trackDynamicImport__1();
    return foo();
}
function $$trackDynamicImport__1() {}
export { $$trackDynamicImport__1 as $$trackDynamicImport__ };
