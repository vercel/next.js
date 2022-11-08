import React from 'react';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-9">
      <div className="flex items-center justify-between">
        <div className="text-xl font-medium text-zinc-500">Product</div>
      </div>

      <div>{children}</div>
    </div>
  );
}
