/* __next_internal_action_entry_do_not_use__ {"1383664d1dc2d9cfe33b88df3fa0eaffef8b99bc":"$$ACTION_5","188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1","56a859f462d35a297c46a1bbd1e6a9058c104ab8":"$$ACTION_3"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { validator, another } from 'auth';
const x = 1;
export default function Page() {
    const y = 1;
    return <Foo action={validator(createActionProxy("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_1).bind(null, encryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", [
        y
    ])))}/>;
}
export async function $$ACTION_1($$ACTION_CLOSURE_BOUND, z) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_CLOSURE_BOUND);
    return x + $$ACTION_ARG_0 + z;
}
validator(createActionProxy("56a859f462d35a297c46a1bbd1e6a9058c104ab8", $$ACTION_3));
export async function $$ACTION_3() {}
another(validator(createActionProxy("1383664d1dc2d9cfe33b88df3fa0eaffef8b99bc", $$ACTION_5)));
export async function $$ACTION_5() {}
