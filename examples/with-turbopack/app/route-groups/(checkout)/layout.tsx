import { Boundary } from '@/ui/Boundary';
import { TabNavItem } from '@/ui/TabNavItem';
import React from 'react';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Boundary
      labels={['checkout layout']}
      color="blue"
      animateRerendering={false}
    >
      <div className="space-y-9">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <TabNavItem href="/route-groups">Back</TabNavItem>
          </div>
        </div>

        <div>{children}</div>
      </div>
    </Boundary>
  );
}
