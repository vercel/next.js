/* __next_internal_action_entry_do_not_use__ $$ACTION_0 */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
import deleteFromDb from 'db';
export function Item(product, foo, bar) {
    async function deleteItem(...args) {
        return $$ACTION_0.apply(null, (deleteItem.$$bound || []).concat(args));
    }
    __create_action_proxy__("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        product.id,
        product?.foo,
        product.bar.baz,
        product,
        foo,
        bar
    ], deleteItem, $$ACTION_0);
    return <Button action={deleteItem}>Delete</Button>;
}
export async function $$ACTION_0(product, product, product, product, foo, bar) {
    await deleteFromDb(product.id, product?.foo, product.bar.baz, product[foo, bar]);
}
