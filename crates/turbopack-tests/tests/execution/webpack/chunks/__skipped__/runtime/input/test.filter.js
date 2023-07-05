module.exports = function (config) {
  // This test can't run in development mode as it depends on the flagIncludedChunks optimization
  return config.mode !== "development";
};
