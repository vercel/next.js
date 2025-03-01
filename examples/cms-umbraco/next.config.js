module.exports = {
  images: {
    // add the Umbraco server domain as allowed domain for serving images
    domains: [process.env.UMBRACO_SERVER_URL.match(/.*\/\/([^:/]*).*/)[1]],
  },
};
