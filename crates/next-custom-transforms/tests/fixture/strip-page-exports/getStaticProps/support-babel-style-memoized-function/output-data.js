function fn() {
  fn = function () {};
  return fn.apply(this, arguments);
}
export function getStaticProps() {
  fn;
}
