module.exports = {
  cache: {
    path: "/tmp/demo1",
    ttl: 3600,
    tbd: 3600 * 24 * 5,
  },
  rules: [
    {
      regex: "^/$",
      ttl: 3,
    },
  ],
};
