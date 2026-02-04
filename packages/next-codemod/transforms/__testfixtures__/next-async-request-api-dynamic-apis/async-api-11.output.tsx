import { headers, type UnsafeUnwrappedHeaders } from 'next/headers';

export function MyComp() {
  void (headers() as unknown as UnsafeUnwrappedHeaders)
}

export function generateContentfulMetadata() {
  void (headers() as unknown as UnsafeUnwrappedHeaders)
}

