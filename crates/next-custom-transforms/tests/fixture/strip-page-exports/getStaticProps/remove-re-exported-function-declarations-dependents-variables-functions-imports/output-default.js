import keep_me from 'hello';
import { keep_me2 } from 'hello2';
import * as keep_me3 from 'hello3';
import { shared4 } from 'shared4';
import default_only1 from 'default_only1';
import { default_only2 } from 'default_only2';
import { default_only3, shared5 } from 'shared5';
import * as default_only4 from 'default_only4';
var leave_me_alone = 1;
function dont_bug_me_either() {}
const default_inception = 'hahaa';
var default_var1 = 1;
let default_var2 = 2;
const default_var3 = default_inception + default_only4;
function default_inception1() {
    default_var2;
    default_only2;
}
function default_abc() {}
const default_b = function() {
    default_var3;
    default_only3;
};
const default_b2 = function default_apples() {};
const default_bla = ()=>{
    default_inception1;
};
export var __N_SSG = true;
export default function Test() {
    default_abc();
    default_only1;
    default_b;
    default_b2;
    default_bla();
    const props = {
        default_var1
    };
    return __jsx("div", null);
}
