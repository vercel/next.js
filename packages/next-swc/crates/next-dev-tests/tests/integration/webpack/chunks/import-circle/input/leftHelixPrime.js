import rightHelixPrime from "./rightHelixPrime";

export function run() {
  return import(/* webpackChunkName: "left" */ "./leftHelix");
}

export default {
  rightHelixPrime: () => rightHelixPrime,
};
