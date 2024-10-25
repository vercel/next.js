<<<<<<< HEAD
/* __next_internal_action_entry_do_not_use__ {"7f6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","7f90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","7f9ed0cc47abc4e1c64320cf42b74ae60b58c40f00":"$$RSC_SERVER_ACTION_3","7fa9b2939c1f39073a6bed227fd20233064c8b7869":"$$RSC_SERVER_ACTION_4"} */ import { registerServerReference } from "private-next-rsc-server-reference";
=======
/* __next_internal_action_entry_do_not_use__ {"1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","9ed0cc47abc4e1c64320cf42b74ae60b58c40f00":"$$RSC_SERVER_ACTION_3"} */ import { registerServerReference } from "private-next-rsc-server-reference";
>>>>>>> canary
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import deleteFromDb from 'db';
export const $$RSC_SERVER_ACTION_0 = async function deleteItem1($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
};
export function Item1(product, foo, bar) {
    const a = registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null).bind(null, encryptActionBoundArgs("006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", [
        product,
        foo,
        bar
    ]));
    return <Button action={a}>Delete</Button>;
}
<<<<<<< HEAD
export async function $$RSC_SERVER_ACTION_0($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
=======
export const $$RSC_SERVER_ACTION_1 = async function deleteItem2($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
>>>>>>> canary
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
};
export function Item2(product, foo, bar) {
    var deleteItem2 = registerServerReference($$RSC_SERVER_ACTION_1, "0090b5db271335765a4b0eab01f044b381b5ebd5cd", null).bind(null, encryptActionBoundArgs("0090b5db271335765a4b0eab01f044b381b5ebd5cd", [
        product,
        foo,
        bar
    ]));
    return <Button action={deleteItem2}>Delete</Button>;
}
<<<<<<< HEAD
export async function $$RSC_SERVER_ACTION_1($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("0090b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
=======
export const $$RSC_SERVER_ACTION_2 = async function deleteItem3($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", $$ACTION_CLOSURE_BOUND);
>>>>>>> canary
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
};
export function Item3(product, foo, bar) {
<<<<<<< HEAD
    const deleteItem3 = registerServerReference($$RSC_SERVER_ACTION_3, "009ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null).bind(null, encryptActionBoundArgs("009ed0cc47abc4e1c64320cf42b74ae60b58c40f00", [
=======
    const deleteItem3 = registerServerReference($$RSC_SERVER_ACTION_2, "1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null).bind(null, encryptActionBoundArgs("1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", [
>>>>>>> canary
        product,
        foo,
        bar
    ]));
    return <Button action={deleteItem3}>Delete</Button>;
}
<<<<<<< HEAD
export async function $$RSC_SERVER_ACTION_3($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("009ed0cc47abc4e1c64320cf42b74ae60b58c40f00", $$ACTION_CLOSURE_BOUND);
=======
export const $$RSC_SERVER_ACTION_3 = async function deleteItem4($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("9ed0cc47abc4e1c64320cf42b74ae60b58c40f00", $$ACTION_CLOSURE_BOUND);
>>>>>>> canary
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
};
export function Item4(product, foo, bar) {
<<<<<<< HEAD
    const deleteItem4 = registerServerReference($$RSC_SERVER_ACTION_4, "00a9b2939c1f39073a6bed227fd20233064c8b7869", null).bind(null, encryptActionBoundArgs("00a9b2939c1f39073a6bed227fd20233064c8b7869", [
=======
    const deleteItem4 = registerServerReference($$RSC_SERVER_ACTION_3, "9ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null).bind(null, encryptActionBoundArgs("9ed0cc47abc4e1c64320cf42b74ae60b58c40f00", [
>>>>>>> canary
        product,
        foo,
        bar
    ]));
    return <Button action={deleteItem4}>Delete</Button>;
}
<<<<<<< HEAD
export async function $$RSC_SERVER_ACTION_4($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("00a9b2939c1f39073a6bed227fd20233064c8b7869", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
}
=======
>>>>>>> canary
