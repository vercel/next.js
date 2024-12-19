/* __next_internal_action_entry_do_not_use__ {"7f7a40999f9833d2bb66a82d6a20a7f2a7810315f8":"createItem"} */ import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { db } from './database';
export const /*#__TURBOPACK_DISABLE_EXPORT_MERGING__*/ createItem = async (title)=>{
    return new Promise((resolve, reject)=>{
        db.serialize(()=>{
            db.run(`INSERT INTO items (title) VALUES ($title)`, {
                $title: title
            }, function() {
                // arguments is allowed here
                const [err] = arguments;
                if (err) {
                    reject(err);
                }
                // this is allowed here
                resolve(this.lastID);
            });
        });
    });
};
import { ensureServerEntryExports } from "private-next-rsc-action-validate";
ensureServerEntryExports([
    createItem
]);
registerServerReference(createItem, "7f7a40999f9833d2bb66a82d6a20a7f2a7810315f8", null);
