import React from 'react';
import StylingNav from './StylingNav';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-9">
      <StylingNav />
      <div>{children}</div>
    </div>
  );
}
