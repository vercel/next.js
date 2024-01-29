// @ts-check

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  modularizeImports: {
    "../components/halves": {
      transform: "../components/halves/{{ member }}",
    },
    "../components/ui": {
      // Use `kebabCase` helper to convert `HeadingLarge` to `heading-large`
      transform: "../components/ui/{{ kebabCase member }}",
      // Use `skipDefaultConversion`, since `HeadingLarge` is exported
      // using named exports instead of default exports
      skipDefaultConversion: true,
    },
  },
};

module.exports = nextConfig;
