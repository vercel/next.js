/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","4090b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { Button } from 'components';
import deleteFromDb from 'db';
export const $$RSC_SERVER_ACTION_0 = async function deleteItem($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb($$ACTION_ARG_1);
};
registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export function Item({ id1, id2 }) {
    id1++;
    return (()=>{
        id1++;
        return <Button action={deleteItem}>Delete</Button>;
    })();
    var deleteItem = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", id1, id2));
}
export const // FIXME: invalid transformation of hoisted functions (https://github.com/vercel/next.js/issues/57392)
// (remove output.js from `tsconfig.json#exclude` to see the error)
$$RSC_SERVER_ACTION_1 = async function deleteItem($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("4090b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb($$ACTION_ARG_1);
};
registerServerReference($$RSC_SERVER_ACTION_1, "4090b5db271335765a4b0eab01f044b381b5ebd5cd", null);
// In this example, if Button immediately executes the action, different ids should
// be passed.
export function Item2({ id1, id2 }) {
    id1++;
    const temp = [];
    temp.push(<Button action={deleteItem}>Delete</Button>);
    id1++;
    temp.push(<Button action={deleteItem}>Delete</Button>);
    return temp;
    var deleteItem = $$RSC_SERVER_ACTION_1.bind(null, encryptActionBoundArgs("4090b5db271335765a4b0eab01f044b381b5ebd5cd", id1, id2));
}
