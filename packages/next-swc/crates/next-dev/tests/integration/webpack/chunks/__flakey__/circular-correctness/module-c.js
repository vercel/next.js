import x from "./module-x";

export default function () {
  if (Math.random() < -1) {
    import(/* webpackChunkName: "a" */ "./module-a");
    import(/* webpackChunkName: "b" */ "./module-b");
  }
  return x;
}
