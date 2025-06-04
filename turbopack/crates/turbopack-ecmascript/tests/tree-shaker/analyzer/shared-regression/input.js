export const order = [];

order.push("a");
const random = Math.random();
const shared = { random, effect: order.push("b") };
order.push("c");

export const a = { shared, a: "aaaaaaaaaaa" };
export const b = { shared, b: "bbbbbbbbbbb" };
