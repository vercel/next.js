/* __next_internal_action_entry_do_not_use__ $$ACTION_0 */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
import deleteFromDb from 'db';
export function Item({ id1 , id2  }) {
    async function deleteItem(...args) {
        return $$ACTION_0.apply(null, (deleteItem.$$bound || []).concat(args));
    }
    __create_action_proxy__("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        id1,
        id2
    ], deleteItem, $$ACTION_0);
    return <Button action={deleteItem}>Delete</Button>;
}
export async function $$ACTION_0(id1, id2) {
    await deleteFromDb(id1);
    await deleteFromDb(id2);
}
