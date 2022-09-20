import * as jest from "jest-circus-browser/dist/umd/jest-circus.js";
import expect from "expect/build-es5/index.js";

globalThis.__jest__ = jest;
globalThis.expect = expect;
globalThis.describe = jest.describe;
globalThis.it = jest.it;
