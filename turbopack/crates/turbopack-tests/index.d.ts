import type * as expectMod from "./tests/execution/node_modules/expect";
import type * as jest from "./tests/execution/node_modules/jest-circus";

export {};

declare global {
  var describe: typeof jest.describe;
  var expect: typeof expectMod.expect;
  var it: typeof jest.it;
  var test: typeof jest.test;
  var nsObj: (obj: Object) => Object;
}
