'use client';

import { use } from 'react';

interface Props {
  params: Promise<{
    slug: string;
  }>;
}

export default function Page(
  props: Props,
) {
  const params = use(props.params);
}
