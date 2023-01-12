import { GetFirstModuleChunk } from "types";

export { RuntimeBackend } from "types";

declare global {
  declare const getFirstModuleChunk: GetFirstModuleChunk;
}
