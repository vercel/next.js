import { headers, type UnsafeUnwrappedHeaders } from 'next/headers';

export function MyComp() {
  (headers() as unknown as UnsafeUnwrappedHeaders)
}

export function generateContentfulMetadata() {
  (headers() as unknown as UnsafeUnwrappedHeaders)
}

