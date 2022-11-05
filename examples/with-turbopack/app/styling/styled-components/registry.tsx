'use client';

import React from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { useStyledComponentsRegistry } from '@/lib/styling';

export default function StyledComponentsRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  const [StyledComponentsRegistry, styledComponentsFlushEffect] =
    useStyledComponentsRegistry();

  useServerInsertedHTML(() => {
    return <>{styledComponentsFlushEffect()}</>;
  });

  return <StyledComponentsRegistry>{children}</StyledComponentsRegistry>;
}
