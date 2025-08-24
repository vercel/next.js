/* __next_internal_action_entry_do_not_use__ {"406a88810ecce4a4e8b59d53b8327d7e98bbf251d7":"$$RSC_SERVER_ACTION_0"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { redirect } from 'navigation';
export const $$RSC_SERVER_ACTION_0 = async function action(formData) {
    redirect('/header?name=' + formData.get('name') + '&hidden-info=' + formData.get('hidden-info'));
};
registerServerReference($$RSC_SERVER_ACTION_0, "406a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
var action = $$RSC_SERVER_ACTION_0;
export default function Form() {
    return <form action={action}>
      <input type="text" name="hidden-info" defaultValue="hi" hidden/>
      <input type="text" name="name" id="name" required/>
      <button type="submit" id="submit">
        Submit
      </button>
    </form>;
}
