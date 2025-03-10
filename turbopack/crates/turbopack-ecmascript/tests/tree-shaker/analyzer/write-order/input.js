export const order = [];

export function func() {
  order.push("d");
}

order.push("a");
const x1 = externalFunction();
const x2 = externalFunction();
export const shared = { effect: order.push("b") };
order.push("c");
