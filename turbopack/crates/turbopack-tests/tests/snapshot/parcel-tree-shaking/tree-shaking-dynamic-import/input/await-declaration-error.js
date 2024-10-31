output = (async () => {
  let {missing} = await import("./async.js");
  return missing;
})();
