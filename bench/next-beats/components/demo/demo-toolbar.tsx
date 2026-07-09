import { isPrefetchEnabled } from '@/components/demo/demo-actions';
import { DemoToolbarClient } from './demo-toolbar-client';

export async function DemoToolbar() {
  const prefetchEnabled = await isPrefetchEnabled();
  return <DemoToolbarClient prefetchEnabled={prefetchEnabled} />;
}
