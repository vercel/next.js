export function Item({ id1 , id2  }) {
    async function deleteItem() {
        return $ACTION_deleteItem(deleteItem.$$closure);
    }
    deleteItem.$$typeof = Symbol.for("react.action.reference");
    deleteItem.$$filepath = "/app/item.js";
    deleteItem.$$name = "$ACTION_deleteItem";
    deleteItem.$$closure = [
        id1,
        id2
    ];
    return <Button action={deleteItem}>Delete</Button>;
}
export async function $ACTION_deleteItem(closure) {
    await deleteFromDb(closure[0]);
    await deleteFromDb(closure[1]);
}
