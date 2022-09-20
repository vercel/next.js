import "./module-x";

export default function () {
  return import(/* webpackChunkName: "c" */ "./module-c");
}
