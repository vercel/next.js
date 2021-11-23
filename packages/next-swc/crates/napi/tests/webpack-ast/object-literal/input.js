import { a } from "x";
import b from "y";

const d = {};

const obj = {
    a,
    [b]: 'foo',
    c: 'bar',
    d
};
console.log(obj);