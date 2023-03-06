/* __next_internal_action_entry_do_not_use__ $ACTION_deleteItem */ import deleteFromDb from 'db';
export function Item(product, foo, bar) {
    async function deleteItem() {
        return $ACTION_deleteItem(deleteItem.$$bound);
    }
    deleteItem.$$typeof = Symbol.for("react.server.reference");
    deleteItem.$$filepath = "/app/item.js";
    deleteItem.$$name = "$ACTION_deleteItem";
    deleteItem.$$bound = [
        product.id,
        product?.foo,
        product.bar.baz,
        product,
        foo,
        bar
    ];
    return <Button action={deleteItem}>Delete</Button>;
}
export async function $ACTION_deleteItem(closure) {
    await deleteFromDb(closure[3].id, closure[3]?.foo, closure[3].bar.baz, closure[3][closure[4], closure[5]]);
}
