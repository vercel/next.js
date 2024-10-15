/* __next_internal_action_entry_do_not_use__ {"6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1","9ed0cc47abc4e1c64320cf42b74ae60b58c40f00":"$$RSC_SERVER_ACTION_3","a9b2939c1f39073a6bed227fd20233064c8b7869":"$$RSC_SERVER_ACTION_4"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import deleteFromDb from 'db';
export function Item1(product, foo, bar) {
    const a = registerServerReference($$RSC_SERVER_ACTION_0, "6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null).bind(null, encryptActionBoundArgs("6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", [
        product,
        foo,
        bar
    ]));
    return <Button action={a}>Delete</Button>;
}
export async function $$RSC_SERVER_ACTION_0($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
}
export function Item2(product, foo, bar) {
    var deleteItem2 = registerServerReference($$RSC_SERVER_ACTION_1, "90b5db271335765a4b0eab01f044b381b5ebd5cd", null).bind(null, encryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", [
        product,
        foo,
        bar
    ]));
    return <Button action={deleteItem2}>Delete</Button>;
}
export async function $$RSC_SERVER_ACTION_1($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
}
export function Item3(product, foo, bar) {
    const deleteItem3 = registerServerReference($$RSC_SERVER_ACTION_3, "9ed0cc47abc4e1c64320cf42b74ae60b58c40f00", null).bind(null, encryptActionBoundArgs("9ed0cc47abc4e1c64320cf42b74ae60b58c40f00", [
        product,
        foo,
        bar
    ]));
    return <Button action={deleteItem3}>Delete</Button>;
}
export async function $$RSC_SERVER_ACTION_3($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("9ed0cc47abc4e1c64320cf42b74ae60b58c40f00", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
}
export function Item4(product, foo, bar) {
    const deleteItem4 = registerServerReference($$RSC_SERVER_ACTION_4, "a9b2939c1f39073a6bed227fd20233064c8b7869", null).bind(null, encryptActionBoundArgs("a9b2939c1f39073a6bed227fd20233064c8b7869", [
        product,
        foo,
        bar
    ]));
    return <Button action={deleteItem4}>Delete</Button>;
}
export async function $$RSC_SERVER_ACTION_4($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2] = await decryptActionBoundArgs("a9b2939c1f39073a6bed227fd20233064c8b7869", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0.id, $$ACTION_ARG_0?.foo, $$ACTION_ARG_0.bar.baz, $$ACTION_ARG_0[$$ACTION_ARG_1, $$ACTION_ARG_2]);
}
