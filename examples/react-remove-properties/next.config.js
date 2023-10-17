// @ts-check

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  compiler: {
    reactRemoveProperties: true,
    // Or, specify a custom list of regular expressions to match properties to remove.
    // The regexes defined here are processed in Rust so the syntax is different from
    // JavaScript `RegExp`s. See https://docs.rs/regex.
    // reactRemoveProperties: { properties: ['^data-custom$'] },
  },
}

module.exports = nextConfig
