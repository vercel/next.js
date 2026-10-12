// @ts-nocheck
import { Suspense } from 'react';

// TODO(runtime-prefetch): assess whether this link should prefetch URL data.
// See: https://nextjs.org/docs/app/guides/runtime-prefetching
// See: https://nextjs.org/docs/app/guides/adopting-partial-prefetching
export const prefetch = 'partial';

export default function Page() {
  return <p>hello world</p>;
}
