/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export function Item({ value }) {
    return <>

      <Button action={registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0).bind(null, encryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        value
    ]))}>

        Multiple

      </Button>

    </>;
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND, value2) {
    var [$$ACTION_ARG_0] = await decryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_CLOSURE_BOUND);
    return $$ACTION_ARG_0 * value2;
}
