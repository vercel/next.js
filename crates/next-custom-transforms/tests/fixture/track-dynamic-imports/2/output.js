import { trackDynamicImport as $$trackDynamicImport__ } from "private-next-rsc-track-dynamic-import";
export default async function Page() {
    await $$trackDynamicImport__(import((await $$trackDynamicImport__(import('./get-name'))).default));
    return null;
}
