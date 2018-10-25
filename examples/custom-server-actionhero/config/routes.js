exports.default = {
  routes: api => ({
    get: [{ path: "/", matchTrailingPathParts: true, action: "render" }]
  })
};
