/* __next_internal_action_entry_do_not_use__ {"1383664d1dc2d9cfe33b88df3fa0eaffef8b99bc":"$$ACTION_5","188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1","56a859f462d35a297c46a1bbd1e6a9058c104ab8":"$$ACTION_3","6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import deleteFromDb from 'db';
export function Item1(product, foo, bar) {
    const a = createActionProxy("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0).bind(null, encryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        product.id,
        product?.foo,
        product.bar.baz,
        product,
        foo,
        bar
    ]));
    return <Button action={a}>Delete</Button>;
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3, $$ACTION_ARG_4, $$ACTION_ARG_5] = await decryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_3.id, $$ACTION_ARG_3?.foo, $$ACTION_ARG_3.bar.baz, $$ACTION_ARG_3[$$ACTION_ARG_4, $$ACTION_ARG_5]);
}
export function Item2(product, foo, bar) {
    function deleteItem2() {}
    return <Button action={createActionProxy("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_1).bind(null, encryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", [
        product.id,
        product?.foo,
        product.bar.baz,
        product,
        foo,
        bar
    ]))}>Delete</Button>;
}
export async function $$ACTION_1($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3, $$ACTION_ARG_4, $$ACTION_ARG_5] = await decryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_3.id, $$ACTION_ARG_3?.foo, $$ACTION_ARG_3.bar.baz, $$ACTION_ARG_3[$$ACTION_ARG_4, $$ACTION_ARG_5]);
}
export function Item3(product, foo, bar) {
    const deleteItem3 = createActionProxy("56a859f462d35a297c46a1bbd1e6a9058c104ab8", $$ACTION_3).bind(null, encryptActionBoundArgs("56a859f462d35a297c46a1bbd1e6a9058c104ab8", [
        product.id,
        product?.foo,
        product.bar.baz,
        product,
        foo,
        bar
    ]));
    return <Button action={deleteItem3}>Delete</Button>;
}
export async function $$ACTION_3($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3, $$ACTION_ARG_4, $$ACTION_ARG_5] = await decryptActionBoundArgs("56a859f462d35a297c46a1bbd1e6a9058c104ab8", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_3.id, $$ACTION_ARG_3?.foo, $$ACTION_ARG_3.bar.baz, $$ACTION_ARG_3[$$ACTION_ARG_4, $$ACTION_ARG_5]);
}
export function Item4(product, foo, bar) {
    const deleteItem4 = createActionProxy("1383664d1dc2d9cfe33b88df3fa0eaffef8b99bc", $$ACTION_5).bind(null, encryptActionBoundArgs("1383664d1dc2d9cfe33b88df3fa0eaffef8b99bc", [
        product.id,
        product?.foo,
        product.bar.baz,
        product,
        foo,
        bar
    ]));
    return <Button action={deleteItem4}>Delete</Button>;
}
export async function $$ACTION_5($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3, $$ACTION_ARG_4, $$ACTION_ARG_5] = await decryptActionBoundArgs("1383664d1dc2d9cfe33b88df3fa0eaffef8b99bc", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_3.id, $$ACTION_ARG_3?.foo, $$ACTION_ARG_3.bar.baz, $$ACTION_ARG_3[$$ACTION_ARG_4, $$ACTION_ARG_5]);
}
