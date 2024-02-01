/* __next_internal_action_entry_do_not_use__ {"188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1","56a859f462d35a297c46a1bbd1e6a9058c104ab8":"$$ACTION_3","9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
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
validator(createActionProxy("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_2));
export async function $$ACTION_2() {}
another(validator(createActionProxy("56a859f462d35a297c46a1bbd1e6a9058c104ab8", $$ACTION_3)));
export async function $$ACTION_3() {}
