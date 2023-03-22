/* __next_internal_action_entry_do_not_use__ $$ACTION_0 */ import deleteFromDb from 'db';
export function Item({ id1 , id2  }) {
    async function deleteItem() {
        return $$ACTION_0(deleteItem.$$bound);
    }
    deleteItem.$$typeof = Symbol.for("react.server.reference");
    deleteItem.$$id = "6d53ce510b2e36499b8f56038817b9bad86cabb4";
    deleteItem.$$bound = [
        id1,
        id2
    ];
    return <Button action={deleteItem}>Delete</Button>;
}
export async function $$ACTION_0(closure) {
    await deleteFromDb(closure[0]);
    await deleteFromDb(closure[1]);
}