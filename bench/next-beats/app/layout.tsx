import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Suspense } from 'react';
import { BoundaryProvider } from '@/components/demo/boundary-provider';
import { DemoToolbar } from '@/components/demo/demo-toolbar';
import { OfflineIndicator } from '@/components/offline-indicator';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { Toaster } from '@/components/theme/toaster';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  description:
    'A Next.js 16.3 music player demonstrating Instant Navigations with Cache Components, App Shells, and Partial Prefetching.',
  title: {
    default: 'NextBeats',
    template: '%s · NextBeats',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="bg-surface dark:bg-surface-dark flex h-[100dvh] flex-col text-black antialiased dark:text-white">
        <ThemeProvider>
          <BoundaryProvider>
            <OfflineIndicator />
            {children}
            <div className="demo-toggles fixed top-3 right-3 z-50 hidden items-end gap-2 sm:flex">
              <Suspense fallback={null}>
                <DemoToolbar />
              </Suspense>
            </div>
            <Toaster />
          </BoundaryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
