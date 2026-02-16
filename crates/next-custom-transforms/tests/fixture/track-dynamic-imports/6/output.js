import { trackDynamicImport as $$trackDynamicImport__ } from "private-next-rsc-track-dynamic-import";
const { foo } = /*#__PURE__*/ $$trackDynamicImport__(import('some-module'));
export default async function Page() {
    const { bar } = await foo;
    return bar();
}
