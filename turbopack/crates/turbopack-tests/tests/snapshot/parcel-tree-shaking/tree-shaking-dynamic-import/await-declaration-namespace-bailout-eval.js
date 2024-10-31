output = (async () => {
  let ns = await import("./async.js");
  let other;
  eval('other = ns.thing;');
  return other;
})();
