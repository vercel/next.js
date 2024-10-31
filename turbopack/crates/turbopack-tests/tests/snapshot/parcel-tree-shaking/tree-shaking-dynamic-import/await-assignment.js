output = (async () => {
  let y, thing;
  ({foo: y, thing} = await import("./async.js"));
  return [y, thing];
})();
