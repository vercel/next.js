/* __next_internal_action_entry_do_not_use__ {"188d5d945750dc32e2c842b93c75a65763d4a922":"$$ACTION_1","56a859f462d35a297c46a1bbd1e6a9058c104ab8":"$$ACTION_3"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import deleteFromDb from 'db';
const v1 = 'v1';
export function Item({ id1, id2 }) {
    const v2 = id2;
    return <>

      <Button action={createActionProxy("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_1).bind(null, encryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", [
        id1,
        v2
    ]))}>

        Delete

      </Button>

      <Button action={createActionProxy("56a859f462d35a297c46a1bbd1e6a9058c104ab8", $$ACTION_3).bind(null, encryptActionBoundArgs("56a859f462d35a297c46a1bbd1e6a9058c104ab8", [
        id1,
        v2
    ]))}>

        Delete

      </Button>

    </>;
}
export async function $$ACTION_1($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("188d5d945750dc32e2c842b93c75a65763d4a922", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
}
export async function $$ACTION_3($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("56a859f462d35a297c46a1bbd1e6a9058c104ab8", $$ACTION_CLOSURE_BOUND);
    await deleteFromDb($$ACTION_ARG_0);
    await deleteFromDb(v1);
    await deleteFromDb($$ACTION_ARG_1);
}
