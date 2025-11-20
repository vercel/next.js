/* __next_internal_action_entry_do_not_use__ {"0095ef8ede0a8a4c822fcbdb018cb264731cb15281":"actionA"} */ import { registerServerReference } from "private-next-rsc-server-reference";
export type X = string;
// @ts-ignore -- that file does not exist
export { type A } from './a';
// @ts-ignore -- that file does not exist
export type { B } from './b';
// @ts-ignore -- that file does not exist
export type * from './c';
export async function actionA(): Promise<string> {
    return 'hello from actionA';
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    actionA
]);
registerServerReference(actionA, "0095ef8ede0a8a4c822fcbdb018cb264731cb15281", null);
