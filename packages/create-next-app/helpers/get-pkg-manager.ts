export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export function getPkgManager(): PackageManager {
  const userAgent = process.env.npm_config_user_agent || "";

  if (userAgent.startsWith("yarn")) {
    return "yarn";
  }

  if (userAgent.startsWith("pnpm")) {
    return "pnpm";
  }

  if (userAgent.startsWith("bun")) {
    return "bun";
  }

  return "npm";
}
