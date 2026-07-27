var root = {};
(function _(namespace, path, parent) {
  for (var i = 0, keys = Object.keys(namespace); i < keys.length; i++) {
    var key = keys[i];
    console.debug("####", path, path ? true : false)
    parent[key] = _(namespace[key], path ? `${path}.${key}` : key, parent[key] || {});
  }
  return parent;
})({
  wrapper: {
    data: {
      key: {}
    },
  }
}, "", root);
