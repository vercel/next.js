/* __next_internal_action_entry_do_not_use__ {"401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","4090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","409ed0cc47abc4e1c64320cf42b74ae60b58c40f00":"$$RSC_SERVER_ACTION_3"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import deleteFromDb from 'db';
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_0 = async function deleteItem1($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
};
export function Item1(product, foo, bar) {
    const a = registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null).bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", product, foo, bar));
    return <Button action={a}>Delete</Button>;
}
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_1 = async function deleteItem2($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("4090b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
};
export function Item2(product, foo, bar) {
    var deleteItem2 = registerServerReference($$RSC_SERVER_ACTION_1, "4090b5db271335765a4b0eab01f044b381b5ebd5cd", null).bind(null, encryptActionBoundArgs("4090b5db271335765a4b0eab01f044b381b5ebd5cd", product, foo, bar));
    return <Button action={deleteItem2}>Delete</Button>;
}
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_2 = async function deleteItem3($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
};
export function Item3(product, foo, bar) {
    const deleteItem3 = registerServerReference($$RSC_SERVER_ACTION_2, "401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null).bind(null, encryptActionBoundArgs("401c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", product, foo, bar));
    return <Button action={deleteItem3}>Delete</Button>;
}
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ $$RSC_SERVER_ACTION_3 = async function deleteItem4($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("409ed0cc47abc4e1c64320cf42b74ae60b58c40f00", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
};
export function Item4(product, foo, bar) {
    const deleteItem4 = registerServerReference($$RSC_SERVER_ACTION_3, "409ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null).bind(null, encryptActionBoundArgs("409ed0cc47abc4e1c64320cf42b74ae60b58c40f00", product, foo, bar));
    return <Button action={deleteItem4}>Delete</Button>;
}
