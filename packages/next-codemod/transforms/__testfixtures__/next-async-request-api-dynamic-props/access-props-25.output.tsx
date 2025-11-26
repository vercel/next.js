'use client';

import { use } from 'react';

interface Props {
  params: Promise<{
    slug: string;
  }>;
}

export default function Page(
  { params }: Props,
) {
  const myParams = use(params);
}
