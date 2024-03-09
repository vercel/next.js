/* __next_internal_action_entry_do_not_use__ {"188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1","56a859f462d35a297c46a1bbd1e6a9058c104ab8":"$$ACTION_3","6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c":"$$ACTION_4"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import deleteFromDb from 'db';
export function Item1(product, foo, bar) {
    const a = registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0).bind(null, encryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
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
    var deleteItem2 = registerServerReference("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_1).bind(null, encryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", [
        product.id,
        product?.foo,
        product.bar.baz,
        product,
        foo,
        bar
    ]));
    return <Button action={deleteItem2}>Delete</Button>;
}
export async function $$ACTION_1($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3, $$ACTION_ARG_4, $$ACTION_ARG_5] = await decryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_3.id, $$ACTION_ARG_3?.foo, $$ACTION_ARG_3.bar.baz, $$ACTION_ARG_3[$$ACTION_ARG_4, $$ACTION_ARG_5]);
}
export function Item3(product, foo, bar) {
    const deleteItem3 = registerServerReference("56a859f462d35a297c46a1bbd1e6a9058c104ab8", $$ACTION_3).bind(null, encryptActionBoundArgs("56a859f462d35a297c46a1bbd1e6a9058c104ab8", [
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
    const deleteItem4 = registerServerReference("9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c", $$ACTION_4).bind(null, encryptActionBoundArgs("9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c", [
        product.id,
        product?.foo,
        product.bar.baz,
        product,
        foo,
        bar
    ]));
    return <Button action={deleteItem4}>Delete</Button>;
}
export async function $$ACTION_4($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1, $$ACTION_ARG_2, $$ACTION_ARG_3, $$ACTION_ARG_4, $$ACTION_ARG_5] = await decryptActionBoundArgs("9c0dd1f7c2b3f41d32e10f5c437de3d67ad32c6c", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_3.id, $$ACTION_ARG_3?.foo, $$ACTION_ARG_3.bar.baz, $$ACTION_ARG_3[$$ACTION_ARG_4, $$ACTION_ARG_5]);
}
