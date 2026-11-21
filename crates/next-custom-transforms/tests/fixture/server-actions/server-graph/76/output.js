import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
export const $$RSC_SERVER_ACTION_0 = /*#__PURE__*/ registerServerReference(async function greet($$ACTION_CLOSURE_BOUND) {
    var [$$ACTION_ARG_0, $$ACTION_ARG_1] = await decryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", $$ACTION_CLOSURE_BOUND);
    if ($$ACTION_ARG_0) {
        console.log('hello', $$ACTION_ARG_1.name);
    } else {
        console.log('hello guest');
    }
}, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":{"name":"$$RSC_SERVER_ACTION_0"}} */ export default async function Home() {
    const user = await getUser();
    const signedIn = user !== null;
    var greet = $$RSC_SERVER_ACTION_0.bind(null, encryptActionBoundArgs("406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", signedIn, user));
    return <form action={greet}>
      <button>Greet</button>
    </form>;
}
