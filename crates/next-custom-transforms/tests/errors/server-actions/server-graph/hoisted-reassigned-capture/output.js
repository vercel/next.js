import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":{"name":"$$RSC_SERVER_ACTION_0"}} */ import { Button } from 'components';
import deleteFromDb from 'db';
export const $$RSC_SERVER_ACTION_0 = /*#__PURE__*/ registerServerReference(async function deleteItem($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb($$ACTION_ARG_1);
}, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
export function Item({ id1, id2 }) {
    id1++;
    var deleteItem = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", id1, id2));
    return (()=>{
        id1++;
        return <Button action={deleteItem}>Delete</Button>;
    })();
}
// In this example, if Button immediately executes the action, different ids should
// be passed.
export function Item2({ id1, id2 }) {
    id1++;
    const temp = [];
    temp.push(<Button action={deleteItem}>Delete</Button>);
    id1++;
    temp.push(<Button action={deleteItem}>Delete</Button>);
    return temp;
    // FIXME: invalid transformation of hoisted functions (https://github.com/vercel/next.js/issues/57392)
    // (remove output.js from `tsconfig.json#exclude` to see the error)
    async function deleteItem() {
        await deleteFromDb(id1);
        await deleteFromDb(id2);
    }
}
