/** @type {import("next").NextConfig} */
const config = {
  experimental: {
    reactBrowserBailout: process.env.TEST_REACT_BROWSER_BAILOUT === '1',
  },
}

module.exports = config
