import loadConfig from "next/dist/server/config";
import { PHASE_DEVELOPMENT_SERVER } from "next/dist/shared/lib/constants";

const loadNextConfig = async () => {
  const nextConfig = await loadConfig(PHASE_DEVELOPMENT_SERVER, process.cwd());

  nextConfig.generateBuildId = await nextConfig.generateBuildId?.();

  // TODO: these functions takes arguments, have to be supported in a different way
  nextConfig.exportPathMap = nextConfig.exportPathMap && {};
  nextConfig.webpack = nextConfig.webpack && {};

  return nextConfig;
};

export { loadNextConfig as default };
