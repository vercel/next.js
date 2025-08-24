let x = true;
let y = false;
let a = x && y;
let b = x || y;
let c = x ?? y;
let d = !x;
let e = !!x;

let chain1 = 1 && 2 && 3 && global;
let chain2 = (1 && 2 && global) || 3 || 4;
let resolve1 = 1 && 2 && global && 3 && 4;
let resolve2 = 1 && 2 && 0 && global && 4;
let resolve3 = global || true;
let resolve4 = true || global;
let resolve5 = global && false;
let resolve6 = false && global;
