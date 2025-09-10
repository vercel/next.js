/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","7f1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","7f90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { Button } from 'components';
import deleteFromDb from 'db';
const v1 = 'v1';
export const $$RSC_SERVER_ACTION_0 = async function deleteItem($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
};
registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export function Item({ id1, id2 }) {
    const v2 = id2;
    const deleteItem = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", id1, v2));
    return <Button action={deleteItem}>Delete</Button>;
}
export const $$RSC_SERVER_ACTION_1 = async function g($$ACTION_CLOSURE_BOUND, y, ...z) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("7f90b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 + y + z[0];
};
registerServerReference($$RSC_SERVER_ACTION_1, "7f90b5db271335765a4b0eab01f044b381b5ebd5cd", null);
let f = (x)=>{
    var g = $$RSC_SERVER_ACTION_1.bind(null, encryptActionBoundArgs("7f90b5db271335765a4b0eab01f044b381b5ebd5cd", x));
};
export const $$RSC_SERVER_ACTION_2 = async function f($$ACTION_CLOSURE_BOUND, y, ...z) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("7f1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 + y + // can't be a `ts-expect-error` because the type of `z` changes to `any` in the output
    // and it stops being an error
    //
    // @ts-ignore: incompatible argument types
    z[0];
};
registerServerReference($$RSC_SERVER_ACTION_2, "7f1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null);
const g = (x)=>{
    f = $$RSC_SERVER_ACTION_2.bind(null, encryptActionBoundArgs("7f1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", x));
};
