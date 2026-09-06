// @ts-nocheck

// Keep this route on the Edge runtime.
// See: https://nextjs.org/docs/app/guides/adopting-partial-prefetching
export const runtime = 'edge', prefetch = 'partial';

export default function Page() {
  return <p>hello world</p>;
}
