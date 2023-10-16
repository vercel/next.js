/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { createActionProxy, encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-proxy";
import deleteFromDb from 'db';
const v1 = 'v1';
export function Item({ id1, id2, id3, id4 }) {
    const v2 = id2;
    async function deleteItem(...args) {
        return $$ACTION_0.apply(null, (deleteItem.$$bound || []).concat(args));
    }
    createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        encryptActionBoundArgs([
            id1,
            v2,
            id3,
            id4.x
        ])
    ], deleteItem, $$ACTION_0);
    return <Button action={deleteItem}>Delete</Button>;
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3] = await decryptActionBoundArgs($$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
    await deleteFromDb({
        id3: $$ACTION_ARG_2
    });
    await deleteFromDb($$ACTION_ARG_3);
}
$$ACTION_0.$$closure_args = 4;
