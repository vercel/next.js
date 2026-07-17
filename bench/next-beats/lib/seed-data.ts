import type { Playlist, PlaylistTrack, Track, User } from '@/lib/db';

// Fixed epoch base so every `createdAt` (and therefore every ordered query
// result) is identical on every build. 2025-01-01T00:00:00Z.
const BASE_TIME = 1_735_689_600_000;
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(BASE_TIME - n * DAY);

export const SEED_USERS: User[] = [{ id: 'e2e', name: 'E2E Tester', createdAt: new Date(BASE_TIME) }];

export const SEED_TRACKS: Track[] = [
  // Electronic
  { id: 't1', title: 'Async Await', artist: 'Neon Pulse', album: 'Event Loop', duration: 234, genre: 'electronic', coverColor: 'from-blue-500 to-indigo-600', playCount: 1842, createdAt: daysAgo(2) },
  { id: 't2', title: 'WebSocket Sunset', artist: 'Neon Pulse', album: 'Event Loop', duration: 198, genre: 'electronic', coverColor: 'from-sky-400 to-blue-500', playCount: 923, createdAt: daysAgo(2) },
  { id: 't3', title: 'Server Sent Vibes', artist: 'Chrome Echo', album: 'Streaming', duration: 267, genre: 'electronic', coverColor: 'from-blue-400 to-cyan-500', playCount: 2105, createdAt: daysAgo(5) },
  { id: 't4', title: 'Hydration', artist: 'Chrome Echo', album: 'Streaming', duration: 312, genre: 'electronic', coverColor: 'from-indigo-400 to-blue-500', playCount: 1567, createdAt: daysAgo(5) },
  { id: 't5', title: 'Hot Module Reload', artist: 'Axiom', album: 'Dev Mode', duration: 245, genre: 'electronic', coverColor: 'from-sky-500 to-indigo-600', playCount: 3201, createdAt: daysAgo(1) },
  // Indie
  { id: 't6', title: 'Localhost Morning', artist: 'Paper Lanterns', album: 'Soft Deploy', duration: 213, genre: 'indie', coverColor: 'from-blue-300 to-sky-500', playCount: 876, createdAt: daysAgo(3) },
  { id: 't7', title: 'README Love Letter', artist: 'Paper Lanterns', album: 'Soft Deploy', duration: 189, genre: 'indie', coverColor: 'from-cyan-400 to-sky-500', playCount: 654, createdAt: daysAgo(3) },
  { id: 't8', title: 'Open Source Crush', artist: 'Velvet Morning', album: 'Pull Request', duration: 227, genre: 'indie', coverColor: 'from-indigo-500 to-blue-600', playCount: 1432, createdAt: daysAgo(7) },
  { id: 't9', title: 'Sunday Deploy', artist: 'Velvet Morning', album: 'Pull Request', duration: 256, genre: 'indie', coverColor: 'from-sky-300 to-blue-400', playCount: 987, createdAt: daysAgo(7) },
  { id: 't10', title: 'npm install feelings', artist: 'Fern & Ivy', album: 'Dependencies', duration: 201, genre: 'indie', coverColor: 'from-blue-600 to-indigo-700', playCount: 1123, createdAt: daysAgo(10) },
  // Hip-Hop
  { id: 't11', title: 'Ship It', artist: 'BLKSMTH', album: 'Production Ready', duration: 194, genre: 'hip-hop', coverColor: 'from-slate-500 to-blue-700', playCount: 4521, createdAt: daysAgo(1) },
  { id: 't12', title: 'Stack Overflow Flow', artist: 'BLKSMTH', album: 'Production Ready', duration: 218, genre: 'hip-hop', coverColor: 'from-indigo-600 to-blue-800', playCount: 3876, createdAt: daysAgo(1) },
  { id: 't13', title: '3 AM Push', artist: 'SyntaxErr', album: 'Debug Mode', duration: 242, genre: 'hip-hop', coverColor: 'from-blue-500 to-sky-600', playCount: 2987, createdAt: daysAgo(4) },
  { id: 't14', title: 'Merge Conflict', artist: 'SyntaxErr', album: 'Debug Mode', duration: 176, genre: 'hip-hop', coverColor: 'from-cyan-500 to-blue-600', playCount: 2145, createdAt: daysAgo(4) },
  { id: 't15', title: 'git push --force', artist: 'Null Pointer', album: 'No Regrets', duration: 208, genre: 'hip-hop', coverColor: 'from-sky-500 to-blue-600', playCount: 1654, createdAt: daysAgo(6) },
  // Pop
  { id: 't16', title: 'Pixel Perfect', artist: 'Luna Park', album: 'Responsive', duration: 195, genre: 'pop', coverColor: 'from-blue-400 to-indigo-500', playCount: 5432, createdAt: daysAgo(0.5) },
  { id: 't17', title: 'Tailwind Hearts', artist: 'Luna Park', album: 'Responsive', duration: 221, genre: 'pop', coverColor: 'from-indigo-400 to-sky-500', playCount: 4321, createdAt: daysAgo(0.5) },
  { id: 't18', title: 'Component Chemistry', artist: 'Prism', album: 'Render Cycle', duration: 237, genre: 'pop', coverColor: 'from-sky-400 to-cyan-500', playCount: 3654, createdAt: daysAgo(2) },
  { id: 't19', title: 'Type Safe Love', artist: 'Prism', album: 'Render Cycle', duration: 189, genre: 'pop', coverColor: 'from-blue-300 to-indigo-400', playCount: 2876, createdAt: daysAgo(2) },
  { id: 't20', title: 'First Contentful Paint', artist: 'Morning Glow', album: 'Core Web Vitals', duration: 214, genre: 'pop', coverColor: 'from-indigo-500 to-blue-700', playCount: 1987, createdAt: daysAgo(8) },
  // Lo-fi
  { id: 't21', title: 'Slow Build', artist: 'Rainfall', album: 'Sunday Deploys', duration: 278, genre: 'lo-fi', coverColor: 'from-blue-500 to-slate-600', playCount: 2543, createdAt: daysAgo(3) },
  { id: 't22', title: 'Console Calm', artist: 'Rainfall', album: 'Sunday Deploys', duration: 302, genre: 'lo-fi', coverColor: 'from-sky-600 to-blue-700', playCount: 1876, createdAt: daysAgo(3) },
  { id: 't23', title: 'Soft Reset', artist: 'Tape Hiss', album: 'Dev Diary', duration: 264, genre: 'lo-fi', coverColor: 'from-cyan-400 to-blue-500', playCount: 1234, createdAt: daysAgo(12) },
  { id: 't24', title: 'Idle Thread', artist: 'Tape Hiss', album: 'Dev Diary', duration: 231, genre: 'lo-fi', coverColor: 'from-blue-400 to-sky-500', playCount: 1567, createdAt: daysAgo(12) },
  { id: 't25', title: 'npm install sleep', artist: 'Dusty Vinyl', album: 'Downtime', duration: 198, genre: 'lo-fi', coverColor: 'from-indigo-300 to-blue-400', playCount: 987, createdAt: daysAgo(15) },
  // Synthwave
  { id: 't26', title: 'Neon Terminal', artist: 'Grid Runner', album: 'After Dark', duration: 345, genre: 'synthwave', coverColor: 'from-blue-600 to-indigo-800', playCount: 876, createdAt: daysAgo(6) },
  { id: 't27', title: 'Retro Compiler', artist: 'Grid Runner', album: 'After Dark', duration: 298, genre: 'synthwave', coverColor: 'from-sky-500 to-indigo-600', playCount: 654, createdAt: daysAgo(6) },
  { id: 't28', title: 'Cyber Monday', artist: 'LaserType', album: 'Digital Sunset', duration: 276, genre: 'synthwave', coverColor: 'from-blue-500 to-cyan-600', playCount: 543, createdAt: daysAgo(9) },
  { id: 't29', title: 'Chrome Dreams', artist: 'LaserType', album: 'Digital Sunset', duration: 312, genre: 'synthwave', coverColor: 'from-indigo-400 to-blue-600', playCount: 432, createdAt: daysAgo(9) },
  { id: 't30', title: 'Midnight Deploy', artist: 'Scanline', album: 'Production Mode', duration: 287, genre: 'synthwave', coverColor: 'from-cyan-500 to-indigo-600', playCount: 765, createdAt: daysAgo(14) },
  // Extra electronic
  { id: 't31', title: 'Race Condition', artist: 'Neon Pulse', album: 'Event Loop', duration: 224, genre: 'electronic', coverColor: 'from-cyan-500 to-blue-600', playCount: 612, createdAt: daysAgo(16) },
  { id: 't32', title: 'Deadlock', artist: 'Chrome Echo', album: 'Concurrency', duration: 256, genre: 'electronic', coverColor: 'from-blue-500 to-indigo-600', playCount: 489, createdAt: daysAgo(17) },
  { id: 't33', title: 'Backpressure', artist: 'Subroutine', album: 'Streams', duration: 301, genre: 'electronic', coverColor: 'from-sky-500 to-cyan-600', playCount: 412, createdAt: daysAgo(18) },
  // Extra indie
  { id: 't34', title: 'Commit Message', artist: 'Margin Notes', album: 'Pull Request', duration: 198, genre: 'indie', coverColor: 'from-sky-400 to-blue-500', playCount: 587, createdAt: daysAgo(19) },
  { id: 't36', title: 'Force Push', artist: 'Reflog', album: 'Lost Commits', duration: 267, genre: 'indie', coverColor: 'from-blue-400 to-indigo-500', playCount: 432, createdAt: daysAgo(21) },
  // Extra hip-hop
  { id: 't37', title: 'Cache Hit', artist: 'BLKSMTH', album: 'Memoize', duration: 187, genre: 'hip-hop', coverColor: 'from-indigo-500 to-blue-600', playCount: 891, createdAt: daysAgo(22) },
  { id: 't39', title: 'Null Pointer', artist: 'Null Pointer', album: 'Segfault', duration: 245, genre: 'hip-hop', coverColor: 'from-blue-600 to-indigo-700', playCount: 654, createdAt: daysAgo(24) },
  // Extra pop
  { id: 't40', title: 'Vibe Coding', artist: 'Sprint Velocity', album: 'Velocity', duration: 189, genre: 'pop', coverColor: 'from-sky-400 to-cyan-500', playCount: 1203, createdAt: daysAgo(25) },
  { id: 't42', title: 'PR Approved', artist: 'Code Review', album: 'LGTM', duration: 195, genre: 'pop', coverColor: 'from-blue-300 to-sky-400', playCount: 843, createdAt: daysAgo(27) },
  // Extra lo-fi
  { id: 't43', title: 'Localhost Lullaby', artist: 'Port 3000', album: 'Dev Server', duration: 278, genre: 'lo-fi', coverColor: 'from-cyan-400 to-sky-500', playCount: 562, createdAt: daysAgo(28) },
  { id: 't44', title: 'Stack Trace', artist: 'Heap Dump', album: 'Postmortem', duration: 312, genre: 'lo-fi', coverColor: 'from-blue-500 to-sky-600', playCount: 478, createdAt: daysAgo(29) },
  // Extra synthwave
  { id: 't46', title: 'CRT Glow', artist: 'VHS Stack', album: 'Retro Mode', duration: 298, genre: 'synthwave', coverColor: 'from-indigo-500 to-blue-700', playCount: 689, createdAt: daysAgo(31) },
  { id: 't47', title: 'Modem Handshake', artist: 'Dial-Up', album: '56k', duration: 245, genre: 'synthwave', coverColor: 'from-blue-600 to-indigo-800', playCount: 534, createdAt: daysAgo(32) },
  { id: 't48', title: 'BIOS Boot', artist: 'Kernel Panic', album: 'POST', duration: 271, genre: 'synthwave', coverColor: 'from-slate-500 to-blue-700', playCount: 467, createdAt: daysAgo(33) },
];

const PLAYLIST_SEED: { id: string; name: string; description: string; coverColor: string; trackIds: string[] }[] = [
  { id: 'pl1', name: 'Late Night Coding', description: 'Beats for the midnight commit.', coverColor: 'from-violet-500 to-purple-600', trackIds: ['t21', 't22', 't24', 't25', 't9'] },
  { id: 'pl2', name: 'Morning Vibes', description: 'Start the day right.', coverColor: 'from-purple-400 to-violet-500', trackIds: ['t6', 't7', 't16', 't17', 't23', 't20'] },
  { id: 'pl3', name: 'High Energy', description: 'Turn it up to eleven.', coverColor: 'from-fuchsia-500 to-purple-600', trackIds: ['t5', 't3', 't26', 't27', 't28', 't30', 't11', 't15'] },
];

// Demo playlists are shared (userId null) so every visitor sees them.
export const SEED_PLAYLISTS: Playlist[] = PLAYLIST_SEED.map(p => ({
  id: p.id,
  name: p.name,
  description: p.description,
  coverColor: p.coverColor,
  userId: null,
  createdAt: new Date(BASE_TIME),
}));

export const SEED_PLAYLIST_TRACKS: PlaylistTrack[] = PLAYLIST_SEED.flatMap(p =>
  p.trackIds.map((trackId, position) => ({ playlistId: p.id, trackId, position, addedAt: new Date(BASE_TIME) }))
);
