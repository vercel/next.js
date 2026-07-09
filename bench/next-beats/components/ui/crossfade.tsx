import { ViewTransition } from 'react';

export function Crossfade({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="auto" default="none">
      {children}
    </ViewTransition>
  );
}
