//@flow

import {fooBar} from './other'
import {FOO, BAR, type MyString} from './re-exports'
import("./async");

const res = (): MyString => fooBar() + "!";
// $FlowFixMe
sideEffectNoop(res());

export const doStuff = res;
