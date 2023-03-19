'use client';

import React from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { useStyledJsxRegistry } from '@/lib/styling';

export default function StyledJsxRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  const [StyledJsxRegistry, styledJsxFlushEffect] = useStyledJsxRegistry();

  useServerInsertedHTML(() => {
    return <>{styledJsxFlushEffect()}</>;
  });

  return <StyledJsxRegistry>{children}</StyledJsxRegistry>;
}
