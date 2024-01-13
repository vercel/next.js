/* __next_internal_action_entry_do_not_use__ {"188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1","9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2","9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c":"$$ACTION_4"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import deleteFromDb from 'db';
const v1 = 'v1';
export function Item({ id1, id2 }) {
    const v2 = id2;
    const deleteItem = createActionProxy("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_1).bind(null, encryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", [
        id1,
        v2
    ]));
    return <Button action={deleteItem}>Delete</Button>;
}
export async function $$ACTION_1($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
}
const f = (x)=>{
    function g() {}
};
export async function $$ACTION_2($$ACTION_CLOSURE_BOUND, y, ...z) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 + y + z[0];
}
const g = (x)=>{
    f = createActionProxy("9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c", $$ACTION_4).bind(null, encryptActionBoundArgs("9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c", [
        x
    ]));
};
export async function $$ACTION_4($$ACTION_CLOSURE_BOUND, y, ...z) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 + y + z[0];
}
