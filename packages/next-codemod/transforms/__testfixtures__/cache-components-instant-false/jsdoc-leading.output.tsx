// @ts-nocheck
/**
 * A page with a leading JSDoc banner.
 * The opt-out must be appended after this block, not inside it.
 */
// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function Page() {
  return <p>jsdoc page</p>;
}
