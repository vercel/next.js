/* __next_internal_action_entry_do_not_use__ {"188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export function Item({ value }) {
    return <>

      <Button action={createActionProxy("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_1).bind(null, encryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", [
        value
    ]))}>

        Multiple

      </Button>

    </>;
}
export async function $$ACTION_1($$ACTION_CLOSURE_BOUND, value2) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 * value2;
}
