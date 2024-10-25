<<<<<<< HEAD
/* __next_internal_action_entry_do_not_use__ {"7f1c36b06e398c97abe5d5d7ae8c672bfddf4e1b91":"$$RSC_SERVER_ACTION_2","7f6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
=======
/* __next_internal_action_entry_do_not_use__ {"6a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0","90b5db271335765a4b0eab01f044b381b5ebd5cd":"$$RSC_SERVER_ACTION_1"} */ import { registerServerReference } from "private-next-rsc-server-reference";
>>>>>>> canary
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import deleteFromDb from 'db';
const v1 = 'v1';
export const $$RSC_SERVER_ACTION_0 = async function action($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("6a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
};
export const $$RSC_SERVER_ACTION_1 = async function action($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
};
export function Item({ id1, id2 }) {
    const v2 = id2;
    return <>
      <Button action={registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null).bind(null, encryptActionBoundArgs("006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", [
        id1,
        v2
    ]))}>
        Delete
      </Button>
<<<<<<< HEAD
      <Button action={registerServerReference($$RSC_SERVER_ACTION_2, "001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", null).bind(null, encryptActionBoundArgs("001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", [
=======
      <Button action={registerServerReference($$RSC_SERVER_ACTION_1, "90b5db271335765a4b0eab01f044b381b5ebd5cd", null).bind(null, encryptActionBoundArgs("90b5db271335765a4b0eab01f044b381b5ebd5cd", [
>>>>>>> canary
        id1,
        v2
    ]))}>
        Delete
      </Button>
    </>;
}
<<<<<<< HEAD
export async function $$RSC_SERVER_ACTION_0($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
}
export async function $$RSC_SERVER_ACTION_2($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("001c36b06e398c97abe5d5d7ae8c672bfddf4e1b91", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
}
=======
>>>>>>> canary
