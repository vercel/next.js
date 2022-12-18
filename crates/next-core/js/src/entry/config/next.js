const loadConfig = require("next/dist/server/config").default;
const { PHASE_DEVELOPMENT_SERVER } = require("next/dist/shared/lib/constants");

module.exports = (async () => {
  const nextConfig = await loadConfig(PHASE_DEVELOPMENT_SERVER, process.cwd());
  nextConfig.rewrites = await nextConfig.rewrites?.();
  nextConfig.redirects = await nextConfig.redirects?.();
  return nextConfig;
})();
