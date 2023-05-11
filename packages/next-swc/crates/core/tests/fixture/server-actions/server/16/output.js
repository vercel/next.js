/* __next_internal_action_entry_do_not_use__ $$ACTION_1,$$ACTION_2,$$ACTION_4 */ import __create_action_proxy__ from "private-next-rsc-action-proxy";
import deleteFromDb from 'db';
const v1 = 'v1';
export function Item({ id1 , id2  }) {
    const v2 = id2;
    const deleteItem = ($$ACTION_0 = async (...args)=>$$ACTION_1.apply(null, ($$ACTION_0.$$bound || []).concat(args)), __create_action_proxy__("188d5d945750dc32e2c842b93c75a65763d4a922", [
        id1,
        v2
    ], $$ACTION_0, $$ACTION_1), $$ACTION_0);
    return <Button action={deleteItem}>Delete</Button>;
}
export const $$ACTION_1 = async (id1, v2)=>{
    await deleteFromDb(id1);
    await deleteFromDb(v1);
    await deleteFromDb(v2);
};
var $$ACTION_0;
const f = (x)=>{
    async function g(...args) {
        return $$ACTION_2.apply(null, (g.$$bound || []).concat(args));
    }
    __create_action_proxy__("9878bfa39811ca7650992850a8751f9591b6a557", [
        x
    ], g, $$ACTION_2);
};
export async function $$ACTION_2(x, y, ...z) {
    return x + y + z[0];
}
const g = (x)=>{
    f = ($$ACTION_3 = async (...args)=>$$ACTION_4.apply(null, ($$ACTION_3.$$bound || []).concat(args)), __create_action_proxy__("9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c", [
        x
    ], $$ACTION_3, $$ACTION_4), $$ACTION_3);
};
export const $$ACTION_4 = async (x, y, ...z)=>{
    return x + y + z[0];
};
var $$ACTION_3;