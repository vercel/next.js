import Loading from '@components/ui/loading';
import { Suspense } from 'react';

import FetchingComponent from './components/fetching-component';

export const revalidate = 0;

export default function ExamplePage() {
  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <Suspense fallback={<Loading />}>
        <FetchingComponent />
      </Suspense>
    </main>
  );
}
