/* __next_internal_action_entry_do_not_use__ {"00f8b140eeaaaa6c987593016c19b3fe41bc812c62":"myCoolServerAction"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import React from 'react';
import inter from '@next/font/google/target.css?{"path":"app/test.tsx","import":"Inter","arguments":[],"variableName":"inter"}';
export async function myCoolServerAction() {
    return <div className={inter.className}>Hello from server action</div>;
}
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    myCoolServerAction
]);
registerServerReference(myCoolServerAction, "00f8b140eeaaaa6c987593016c19b3fe41bc812c62", null);
