/* __next_internal_action_entry_do_not_use__ $ACTION_deleteItem */ import deleteFromDb from 'db';
export function Item(product) {
    async function deleteItem() {
        return $ACTION_deleteItem(deleteItem.$$closure);
    }
    deleteItem.$$typeof = Symbol.for("react.server.reference");
    deleteItem.$$filepath = "/app/item.js";
    deleteItem.$$name = "$ACTION_deleteItem";
    deleteItem.$$closure = [
        product.id,
        product.foo,
        product.bar.baz
    ];
    return <Button action={deleteItem}>Delete</Button>;
}
export async function $ACTION_deleteItem(closure) {
    await deleteFromDb(closure[0], closure[1], closure[2]);
}
