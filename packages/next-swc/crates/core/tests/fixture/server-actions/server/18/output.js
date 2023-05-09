/* __next_internal_action_entry_do_not_use__ $$ACTION_1,$$ACTION_3 */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
import deleteFromDb from 'db';
const v1 = 'v1';
export function Item({ id1 , id2  }) {
    const v2 = id2;
    return <>

      <Button action={$$ACTION_0 = async (...args)=>$$ACTION_1.apply(null, ($$ACTION_0.$$bound || []).concat(args)), __create_action_proxy__("188d5d945750dc32e2c842b93c75a65763d4a922", [
        id1,
        v2
    ], $$ACTION_0, $$ACTION_1), $$ACTION_0}>

        Delete

      </Button>

      <Button action={$$ACTION_2 = async function(...args) {
        return $$ACTION_3.apply(null, ($$ACTION_2.$$bound || []).concat(args));
    }, __create_action_proxy__("56a859f462d35a297c46a1bbd1e6a9058c104ab8", [
        id1,
        v2
    ], $$ACTION_2, $$ACTION_3), $$ACTION_2}>

        Delete

      </Button>

    </>;
}
export const $$ACTION_1 = async (id1, v2)=>{
    await deleteFromDb(id1);
    await deleteFromDb(v1);
    await deleteFromDb(v2);
};
var $$ACTION_0;
export async function $$ACTION_3(id1, v2) {
    await deleteFromDb(id1);
    await deleteFromDb(v1);
    await deleteFromDb(v2);
}
var $$ACTION_2;
