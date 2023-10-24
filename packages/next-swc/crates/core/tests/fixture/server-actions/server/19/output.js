/* __next_internal_action_entry_do_not_use__ {"188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export function Item({ value }) {
    return <>

      <Button action={$$ACTION_0 = async (...args)=>$$ACTION_1.apply(null, ($$ACTION_0.$$bound || []).concat(args)), createActionProxy("188d5d945750dc32e2c842b93c75a65763d4a922", [
        encryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", [
            value
        ])
    ], $$ACTION_0, $$ACTION_1), $$ACTION_0}>

        Multiple

      </Button>

    </>;
}
export var $$ACTION_1 = async ($$ACTION_CLOSURE_BOUND, value2)=>{
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 * value2;
};
var $$ACTION_0;
