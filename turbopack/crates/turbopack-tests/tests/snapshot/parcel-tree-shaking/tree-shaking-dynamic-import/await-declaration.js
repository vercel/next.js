output = (async () => {
  let {foo: y, thing} = await import("./async.js");
  return [y, thing];
})();
