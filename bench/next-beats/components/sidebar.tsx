import { Heart, Home, Library, Plus, Search, Music } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import ErrorBoundary from '@/components/ui/error-boundary';
import { GitHubIcon } from '@/components/ui/github-icon';
import { IconButtonLink, IconButtonLinkSkeleton } from '@/components/ui/icon-button-link';
import { MusicNote } from '@/components/ui/music-note';
import { NavLink } from '@/components/ui/nav-link';
import { Skeleton } from '@/components/ui/skeleton';
import { getPlaylists } from '@/features/playlist/playlist-queries';
import { CurrentUserAvatar, CurrentUserAvatarSkeleton } from '@/features/user/components/current-user-avatar';
import { LogOutButton } from '@/features/user/components/log-out-button';
import { signOut } from '@/features/user/user-actions';
import type { Route } from 'next';

const sidebarLink =
  'flex items-center justify-center gap-3 rounded-md p-2 text-sm tracking-tight transition-colors lg:justify-start lg:px-3 text-muted not-aria-[current=page]:hover:text-black dark:not-aria-[current=page]:hover:text-white aria-[current=page]:bg-white/10 aria-[current=page]:font-bold aria-[current=page]:text-black aria-[current=page]:dark:text-white aria-[current=page]:[&_svg]:stroke-[2.5]';

export function Sidebar() {
  return (
    <aside className="hidden w-[4.5rem] flex-col gap-2 p-2 sm:flex lg:w-[17.5rem]">
      <div className="bg-card dark:bg-card-dark rounded-lg p-3 lg:p-4">
        <div className="mb-4 hidden items-center justify-between lg:flex">
          <Link
            href="/"
            className="text-accent inline-flex items-center gap-2 px-1 text-xl font-bold tracking-tight"
            aria-label="NextBeats home"
          >
            <MusicNote size={24} className="text-accent" />
            <span>NextBeats</span>
          </Link>
          <a
            href="https://github.com/vercel-labs/next-beats"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray rounded-full p-1.5 transition-colors hover:text-black dark:hover:text-white"
            aria-label="View source on GitHub"
          >
            <GitHubIcon className="h-4 w-4" />
          </a>
        </div>
        <nav className="flex flex-col gap-1 text-sm font-medium">
          <NavLink href="/" aria-label="Home" className={sidebarLink}>
            <Home className="h-5 w-5" />
            <span className="hidden truncate lg:inline">Home</span>
          </NavLink>
          <NavLink href="/search" aria-label="Search" className={sidebarLink}>
            <Search className="h-5 w-5" />
            <span className="hidden truncate lg:inline">Search</span>
          </NavLink>
          <NavLink href="/library" aria-label="Library" className={sidebarLink}>
            <Music className="h-5 w-5" />
            <span className="hidden truncate lg:inline">Library</span>
          </NavLink>
        </nav>
      </div>

      <div className="bg-card dark:bg-card-dark flex min-h-0 flex-1 flex-col rounded-lg">
        <div className="flex items-center gap-2 px-3 py-3 lg:px-4">
          <Library className="text-gray h-5 w-5 shrink-0" />
          <span className="text-gray hidden text-sm font-bold lg:inline">Your Library</span>
          <Suspense fallback={<IconButtonLinkSkeleton className="ml-auto hidden lg:block" />}>
            <IconButtonLink href="/playlist" label="Create playlist" className="ml-auto hidden lg:block">
              <Plus className="h-5 w-5" />
            </IconButtonLink>
          </Suspense>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          <NavLink href="/favorites" aria-label="Liked Tracks" className={sidebarLink}>
            <Heart className="h-4 w-4" />
            <span className="hidden truncate lg:inline">Liked Tracks</span>
          </NavLink>
          <div className="border-divider dark:border-divider-dark my-1 hidden border-t lg:block" />
          <ErrorBoundary title="Playlists unavailable" compact>
            <Suspense fallback={<SidebarPlaylistsSkeleton />}>
              <SidebarPlaylists />
            </Suspense>
          </ErrorBoundary>
        </nav>
        <div className="border-divider dark:border-divider-dark hidden items-center justify-between border-t px-3 py-2 lg:flex">
          <div className="flex items-center gap-2">
            <Suspense fallback={<CurrentUserAvatarSkeleton />}>
              <CurrentUserAvatar />
            </Suspense>
            <form action={signOut}>
              <LogOutButton />
            </form>
          </div>
          <ThemeToggle variant="inline" />
        </div>
      </div>
    </aside>
  );
}

async function SidebarPlaylists() {
  const playlists = await getPlaylists();
  if (playlists.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {playlists.map(pl => (
        <NavLink
          key={pl.id}
          hoverPrefetch
          href={`/playlist/${pl.id}` as Route}
          aria-label={pl.name}
          className={sidebarLink}
        >
          <span className={`inline-block h-3 w-3 shrink-0 rounded-sm bg-gradient-to-br ${pl.coverColor}`} />
          <span className="hidden truncate lg:inline">{pl.name}</span>
        </NavLink>
      ))}
    </div>
  );
}

function SidebarPlaylistsSkeleton() {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex min-h-9 items-center gap-3 rounded-md p-2 lg:px-3">
          <Skeleton className="h-3 w-3 shrink-0 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
