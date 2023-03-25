/* __next_internal_action_entry_do_not_use__ $$ACTION_1,$$ACTION_2,$$ACTION_4 */ import deleteFromDb from 'db';
const v1 = 'v1';
export function Item({ id1 , id2  }) {
    const v2 = id2;
    const deleteItem = ($$ACTION_0 = async ()=>$$ACTION_1($$ACTION_0.$$bound), $$ACTION_0.$$typeof = Symbol.for("react.server.reference"), $$ACTION_0.$$id = "188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_0.$$bound = [
        id1,
        v2
    ], $$ACTION_0);
    return <Button action={deleteItem}>Delete</Button>;
}
export const $$ACTION_1 = async (closure)=>{
    await deleteFromDb(closure[0]);
    await deleteFromDb(v1);
    await deleteFromDb(closure[1]);
};
var $$ACTION_0;
const f = (x)=>{
    async function g(y, ...z) {
        return $$ACTION_2(g.$$bound);
    }
    g.$$typeof = Symbol.for("react.server.reference");
    g.$$id = "9878bfa39811ca7650992850a8751f9591b6a557";
    g.$$bound = [
        x
    ];
};
export async function $$ACTION_2(closure, y = closure[1], z = closure.slice(2)) {
    return closure[0] + y + z[0];
}
const g = (x)=>{
    f = ($$ACTION_3 = async (y, ...z)=>$$ACTION_4($$ACTION_3.$$bound), $$ACTION_3.$$typeof = Symbol.for("react.server.reference"), $$ACTION_3.$$id = "9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c", $$ACTION_3.$$bound = [
        x
    ], $$ACTION_3);
};
export const $$ACTION_4 = async (closure, y = closure[1], z = closure.slice(2))=>{
    return closure[0] + y + z[0];
};
var $$ACTION_3;
