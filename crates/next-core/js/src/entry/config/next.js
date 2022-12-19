import loadConfig from "next/dist/server/config";
import { PHASE_DEVELOPMENT_SERVER } from "next/dist/shared/lib/constants";

const loadNextConfig = async () => {
  const nextConfig = await loadConfig(PHASE_DEVELOPMENT_SERVER, process.cwd());
  nextConfig.rewrites = await nextConfig.rewrites?.();
  nextConfig.redirects = await nextConfig.redirects?.();
  return nextConfig;
};

export { loadNextConfig as default };
