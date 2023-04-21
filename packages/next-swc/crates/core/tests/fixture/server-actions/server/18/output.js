/* __next_internal_action_entry_do_not_use__ $$ACTION_1,$$ACTION_3 */ import deleteFromDb from 'db';
const v1 = 'v1';
export function Item({ id1 , id2  }) {
    const v2 = id2;
    return <>

      <Button action={$$ACTION_0 = async ()=>$$ACTION_1($$ACTION_0.$$bound), $$ACTION_0.$$typeof = Symbol.for("react.server.reference"), $$ACTION_0.$$id = "188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_0.$$bound = [
        id1,
        v2
    ], $$ACTION_0}>

        Delete

      </Button>

      <Button action={$$ACTION_2 = async function() {
        return $$ACTION_3($$ACTION_2.$$bound);
    }, $$ACTION_2.$$typeof = Symbol.for("react.server.reference"), $$ACTION_2.$$id = "56a859f462d35a297c46a1bbd1e6a9058c104ab8", $$ACTION_2.$$bound = [
        id1,
        v2
    ], $$ACTION_2}>

        Delete

      </Button>

    </>;
}
export const $$ACTION_1 = async (closure)=>{
    await deleteFromDb(closure[0]);
    await deleteFromDb(v1);
    await deleteFromDb(closure[1]);
};
var $$ACTION_0;
export async function $$ACTION_3(closure) {
    await deleteFromDb(closure[0]);
    await deleteFromDb(v1);
    await deleteFromDb(closure[1]);
}
var $$ACTION_2;
