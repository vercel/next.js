/* __next_internal_action_entry_do_not_use__ {"6d53ce510b2e36499b8f56038817b9bad86cabb4":"$$ACTION_0","9878bfa39811ca7650992850a8751f9591b6a557":"$$ACTION_2"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import deleteFromDb from 'db';
const v1 = 'v1';
export function Item({ id1, id2 }) {
    const v2 = id2;
    return <>
      <Button action={registerServerReference("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_0).bind(null, encryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", [
        id1,
        v2
    ]))}>
        Delete
      </Button>
      <Button action={registerServerReference("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_2).bind(null, encryptActionBoundArgs("9878bfa39811ca7650992850a8751f9591b6a557", [
        id1,
        v2
    ]))}>
        Delete
      </Button>
    </>;
}
export async function $$ACTION_0($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("6d53ce510b2e36499b8f56038817b9bad86cabb4", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
}
export async function $$ACTION_2($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("9878bfa39811ca7650992850a8751f9591b6a557", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
}
