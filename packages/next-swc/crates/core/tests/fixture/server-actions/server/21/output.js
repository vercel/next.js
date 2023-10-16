/* __next_internal_action_entry_do_not_use__ {"1383664d1dc2d9cfe33b88df3fa0eaffef8b99bc":"$$ACTION_5","56a859f462d35a297c46a1bbd1e6a9058c104ab8":"$$ACTION_3","188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { validator, another } from 'auth';
const x = 1;
export default function Page() {
    const y = 1;
    return <Foo action={validator(($$ACTION_0 = async function(...args) {
        return $$ACTION_1.apply(null, ($$ACTION_0.$$bound || []).concat(args));
    }, createActionProxy("188d5d945750dc32e2c842b93c75a65763d4a922", [
        encryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", [
            y
        ])
    ], $$ACTION_0, $$ACTION_1), $$ACTION_0))}/>;
}
export async function $$ACTION_1($$ACTION_CLOSURE_BOUND, z) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_CLOSURE_BOUND);
    return x + $$ACTION_ARG_0 + z;
}
var $$ACTION_0;
validator(($$ACTION_2 = async (...args)=>$$ACTION_3.apply(null, ($$ACTION_2.$$bound || []).concat(args)), createActionProxy("56a859f462d35a297c46a1bbd1e6a9058c104ab8", null, $$ACTION_2, $$ACTION_3), $$ACTION_2));
export var $$ACTION_3 = async ()=>{};
var $$ACTION_2;
another(validator(($$ACTION_4 = async (...args)=>$$ACTION_5.apply(null, ($$ACTION_4.$$bound || []).concat(args)), createActionProxy("1383664d1dc2d9cfe33b88df3fa0eaffef8b99bc", null, $$ACTION_4, $$ACTION_5), $$ACTION_4)));
export var $$ACTION_5 = async ()=>{};
var $$ACTION_4;
