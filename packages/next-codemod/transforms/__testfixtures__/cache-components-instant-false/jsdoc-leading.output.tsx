// @ts-nocheck
/**
 * A page with a leading JSDoc banner.
 * The opt-out must be appended after this block, not inside it.
 */
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function Page() {
  return <p>jsdoc page</p>;
}
