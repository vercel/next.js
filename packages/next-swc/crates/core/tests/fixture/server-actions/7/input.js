import deleteFromDb from 'db'

export function Item(product) {
    async function deleteItem() {
        "use server";
        await deleteFromDb(product.id,product?.foo,product.bar.baz);
    }
    return <Button action={deleteItem}>Delete</Button>;
}