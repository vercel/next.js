output = (async () => {
  let missing;
  ({missing} = await import("./async.js"));
  return missing;
})();
