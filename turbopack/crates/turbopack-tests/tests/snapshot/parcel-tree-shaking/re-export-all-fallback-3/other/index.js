//@flow

import {FOO, BAR, type MyString} from "../re-exports";

const myFunc = (): MyString => FOO + BAR;

let res = myFunc();

export const fooBar = (): MyString => res;