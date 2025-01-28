import { trackDynamicImport as $$trackDynamicImport__ } from "private-next-rsc-track-dynamic-import";
const promise = /*#__PURE__*/ $$trackDynamicImport__(import('some-module'));
export default async function Page() {
    const { foo } = await promise;
    return foo();
}
