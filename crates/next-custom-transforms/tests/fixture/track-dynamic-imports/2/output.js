import { trackDynamicImport as $$trackDynamicImport__ } from "private-next-rsc-track-dynamic-import";
export default async function Page() {
    await /*#__PURE__*/ $$trackDynamicImport__(import((await /*#__PURE__*/ $$trackDynamicImport__(import('get-name'))).default));
    return null;
}
