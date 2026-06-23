import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const $$RSC_SERVER_ACTION_0 = async function deleteItem() {
    console.log('delete item');
};
registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
__turbopack_emit__("./item.js", {
    namespace: process.env.NEXT_RUNTIME === 'nodejs' ? 'next/server-actions/rsc-nodejs' : 'next/server-actions/rsc-edge',
    data: "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7|$$RSC_SERVER_ACTION_0"
});
export function Item() {
    var deleteItem = $$RSC_SERVER_ACTION_0;
    return <button onClick={deleteItem}>Delete</button>;
}
export const $$RSC_SERVER_ACTION_1 = async function action($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("4090b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    console.log($$ACTION_ARG_0);
    console.log($$ACTION_ARG_1);
};
registerServerReference($$RSC_SERVER_ACTION_1, "4090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
__turbopack_emit__("./item.js", {
    namespace: process.env.NEXT_RUNTIME === 'nodejs' ? 'next/server-actions/rsc-nodejs' : 'next/server-actions/rsc-edge',
    data: "4090b5db271335765a4b0eab01f044b381b5ebd5cd|$$RSC_SERVER_ACTION_1"
});
export default function Home() {
    const info = {
        name: 'John',
        test: 'test'
    };
    const action = $$RSC_SERVER_ACTION_1.bind(null, encryptActionBoundArgs("4090b5db271335765a4b0eab01f044b381b5ebd5cd", info.name, info.test));
    return null;
}
