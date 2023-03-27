/* __next_internal_action_entry_do_not_use__ $$ACTION_0 */ import deleteFromDb from 'db';
export function Item(product, foo, bar) {
    async function deleteItem() {
        return $$ACTION_0(deleteItem.$$bound);
    }
    deleteItem.$$typeof = Symbol.for("react.server.reference");
    deleteItem.$$id = "6d53ce510b2e36499b8f56038817b9bad86cabb4";
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
export async function $$ACTION_0(closure) {
    await deleteFromDb(closure[3].id, closure[3]?.foo, closure[3].bar.baz, closure[3][closure[4], closure[5]]);
}