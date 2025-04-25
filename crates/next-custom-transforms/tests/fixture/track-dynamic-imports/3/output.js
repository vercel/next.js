import { trackDynamicImport as $$trackDynamicImport__ } from "private-next-rsc-track-dynamic-import";
export default async function Page() {
    await /*#__PURE__*/ $$trackDynamicImport__(import('./some-file'));
    // name conflict
    $$trackDynamicImport__1();
    return null;
}
function $$trackDynamicImport__1() {}
export { $$trackDynamicImport__1 as $$trackDynamicImport__ };
