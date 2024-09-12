import { registerServerReference } from "private-next-rsc-server-reference";
import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
import { cache as $cache } from "private-next-rsc-cache-wrapper";

export { foo }

const foo = $cache("default", "id", async function () {
  return 'bar'
})

registerServerReference("id", foo)
