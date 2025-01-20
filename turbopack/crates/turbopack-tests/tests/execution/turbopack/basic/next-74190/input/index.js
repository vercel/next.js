var root = {};
const result = (function _(namespace, path, parent) {
  console.debug("####", path, path ? true : false)
  for (var i = 0, keys = Object.keys(namespace); i < keys.length; i++) {
    var key = keys[i];
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

it('should evaluate IIFE correctly', () => {
  expect(result).toEqual({
    wrapper: {
      data: {
        key: {}
      },
    }
  });
});
