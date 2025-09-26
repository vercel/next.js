import { trackDynamicImport as $$trackDynamicImport__ } from "private-next-rsc-track-dynamic-import";
export default async function Page() {
    const { foo } = await /*#__PURE__*/ $$trackDynamicImport__(import('some-module'));
    return foo();
}
