// Turbopack bakes `assetPrefix` into the chunk loader at build time, so unlike
// webpack it can't pick up an `assetPrefix` that is only set at runtime. When the
// two disagree the page server-renders but never hydrates, so warn instead of
// failing silently.
export function createTurbopackSetPublicPath() {
  return (runtimePublicPath: string) => {
    // `__NEXT_ASSET_PREFIX` is the value baked in at build time via define-env.
    const buildTimeAssetPrefix = process.env.__NEXT_ASSET_PREFIX || ''
    if (runtimePublicPath === `${buildTimeAssetPrefix}/_next/`) return

    const runtimeAssetPrefix = runtimePublicPath.replace(/\/_next\/$/, '')
    console.error(
      `\`assetPrefix\` was "${buildTimeAssetPrefix}" at build time but ` +
        `"${runtimeAssetPrefix}" at runtime. Turbopack embeds \`assetPrefix\` at ` +
        `build time and ignores the runtime value, so client chunks load from the ` +
        `build-time prefix and the page will not hydrate. Use the same \`assetPrefix\` ` +
        `at build and runtime, or build with \`next build --webpack\`.`
    )
  }
}
