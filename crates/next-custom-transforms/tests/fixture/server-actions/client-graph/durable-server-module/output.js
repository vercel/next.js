/* __next_internal_action_entry_do_not_use__ {"00c18c215a6b7cdc64bf709f3a714ffdef1bf9651d":{"name":"default","durable":true},"00f5c8c7c79daa6cc38a32ba760982c48dcb4ec09f":{"name":"arrow","durable":true},"4093c1844b3effd1d977be0ba593ad5b1785330b0b":{"name":"ordinary"},"40b7a826ae468e7884962e69864f9e1a63e74e6b6d":{"name":"namedAlias","durable":true}} */ import { createServerReference, callServer, findSourceMapURL } from "private-next-rsc-action-client-wrapper";
const $$RSC_SERVER_ACTION_1 = /*#__PURE__*/ createServerReference("40b7a826ae468e7884962e69864f9e1a63e74e6b6d", callServer, void 0, findSourceMapURL, "namedAlias");
export { $$RSC_SERVER_ACTION_1 as namedAlias };
const $$RSC_SERVER_ACTION_2 = /*#__PURE__*/ createServerReference("00f5c8c7c79daa6cc38a32ba760982c48dcb4ec09f", callServer, void 0, findSourceMapURL, "arrow");
export { $$RSC_SERVER_ACTION_2 as arrow };
export default /*#__PURE__*/ createServerReference("00c18c215a6b7cdc64bf709f3a714ffdef1bf9651d", callServer, void 0, findSourceMapURL, "default");
const $$RSC_SERVER_ACTION_3 = /*#__PURE__*/ createServerReference("4093c1844b3effd1d977be0ba593ad5b1785330b0b", callServer, void 0, findSourceMapURL, "ordinary");
export { $$RSC_SERVER_ACTION_3 as ordinary };
