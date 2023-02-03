export function Item({ id1, id2 }) {
    async function deleteItem() {
        "use action";
        await deleteFromDb(id1);
        await deleteFromDb(id2);
    }
    return <Button action={deleteItem}>Delete</Button>;
}