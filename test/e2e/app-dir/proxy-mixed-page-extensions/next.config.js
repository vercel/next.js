/** @type {import('next').NextConfig} */
module.exports = {
  // Mix a compound entry (`page.tsx`) and a simple entry (`tsx`) so that
  // `proxy.page.tsx` is recognized as a proxy via the compound rule while
  // simple-extension routes (`app/page.tsx`) keep working alongside it.
  pageExtensions: ['page.tsx', 'tsx'],
}
