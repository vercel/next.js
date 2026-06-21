// @ts-nocheck
// TODO: Cache Components adoption. Remove once this route navigates instantly.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function Layout({ children }) {
  return <section>{children}</section>;
}
