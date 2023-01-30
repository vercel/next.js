import defaultErrorMap from "./locales/en";
import type { ZodErrorMap } from "./ZodError";
export { defaultErrorMap };
export declare function setErrorMap(map: ZodErrorMap): void;
export declare function getErrorMap(): ZodErrorMap;
