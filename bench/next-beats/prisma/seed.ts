 
import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client';

const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

type SeedTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  genre: string;
  coverColor: string;
  playCount: number;
  createdAt: Date;
};

const now = Date.now();
const day = 86_400_000;

const TRACKS: SeedTrack[] = [
  // Electronic
  {
    id: 't1',
    title: 'Async Await',
    artist: 'Neon Pulse',
    album: 'Event Loop',
    duration: 234,
    genre: 'electronic',
    coverColor: 'from-blue-500 to-indigo-600',
    playCount: 1842,
    createdAt: new Date(now - 2 * day),
  },
  {
    id: 't2',
    title: 'WebSocket Sunset',
    artist: 'Neon Pulse',
    album: 'Event Loop',
    duration: 198,
    genre: 'electronic',
    coverColor: 'from-sky-400 to-blue-500',
    playCount: 923,
    createdAt: new Date(now - 2 * day),
  },
  {
    id: 't3',
    title: 'Server Sent Vibes',
    artist: 'Chrome Echo',
    album: 'Streaming',
    duration: 267,
    genre: 'electronic',
    coverColor: 'from-blue-400 to-cyan-500',
    playCount: 2105,
    createdAt: new Date(now - 5 * day),
  },
  {
    id: 't4',
    title: 'Hydration',
    artist: 'Chrome Echo',
    album: 'Streaming',
    duration: 312,
    genre: 'electronic',
    coverColor: 'from-indigo-400 to-blue-500',
    playCount: 1567,
    createdAt: new Date(now - 5 * day),
  },
  {
    id: 't5',
    title: 'Hot Module Reload',
    artist: 'Axiom',
    album: 'Dev Mode',
    duration: 245,
    genre: 'electronic',
    coverColor: 'from-sky-500 to-indigo-600',
    playCount: 3201,
    createdAt: new Date(now - 1 * day),
  },
  // Indie
  {
    id: 't6',
    title: 'Localhost Morning',
    artist: 'Paper Lanterns',
    album: 'Soft Deploy',
    duration: 213,
    genre: 'indie',
    coverColor: 'from-blue-300 to-sky-500',
    playCount: 876,
    createdAt: new Date(now - 3 * day),
  },
  {
    id: 't7',
    title: 'README Love Letter',
    artist: 'Paper Lanterns',
    album: 'Soft Deploy',
    duration: 189,
    genre: 'indie',
    coverColor: 'from-cyan-400 to-sky-500',
    playCount: 654,
    createdAt: new Date(now - 3 * day),
  },
  {
    id: 't8',
    title: 'Open Source Crush',
    artist: 'Velvet Morning',
    album: 'Pull Request',
    duration: 227,
    genre: 'indie',
    coverColor: 'from-indigo-500 to-blue-600',
    playCount: 1432,
    createdAt: new Date(now - 7 * day),
  },
  {
    id: 't9',
    title: 'Sunday Deploy',
    artist: 'Velvet Morning',
    album: 'Pull Request',
    duration: 256,
    genre: 'indie',
    coverColor: 'from-sky-300 to-blue-400',
    playCount: 987,
    createdAt: new Date(now - 7 * day),
  },
  {
    id: 't10',
    title: 'npm install feelings',
    artist: 'Fern & Ivy',
    album: 'Dependencies',
    duration: 201,
    genre: 'indie',
    coverColor: 'from-blue-600 to-indigo-700',
    playCount: 1123,
    createdAt: new Date(now - 10 * day),
  },
  // Hip-Hop
  {
    id: 't11',
    title: 'Ship It',
    artist: 'BLKSMTH',
    album: 'Production Ready',
    duration: 194,
    genre: 'hip-hop',
    coverColor: 'from-slate-500 to-blue-700',
    playCount: 4521,
    createdAt: new Date(now - 1 * day),
  },
  {
    id: 't12',
    title: 'Stack Overflow Flow',
    artist: 'BLKSMTH',
    album: 'Production Ready',
    duration: 218,
    genre: 'hip-hop',
    coverColor: 'from-indigo-600 to-blue-800',
    playCount: 3876,
    createdAt: new Date(now - 1 * day),
  },
  {
    id: 't13',
    title: '3 AM Push',
    artist: 'SyntaxErr',
    album: 'Debug Mode',
    duration: 242,
    genre: 'hip-hop',
    coverColor: 'from-blue-500 to-sky-600',
    playCount: 2987,
    createdAt: new Date(now - 4 * day),
  },
  {
    id: 't14',
    title: 'Merge Conflict',
    artist: 'SyntaxErr',
    album: 'Debug Mode',
    duration: 176,
    genre: 'hip-hop',
    coverColor: 'from-cyan-500 to-blue-600',
    playCount: 2145,
    createdAt: new Date(now - 4 * day),
  },
  {
    id: 't15',
    title: 'git push --force',
    artist: 'Null Pointer',
    album: 'No Regrets',
    duration: 208,
    genre: 'hip-hop',
    coverColor: 'from-sky-500 to-blue-600',
    playCount: 1654,
    createdAt: new Date(now - 6 * day),
  },
  // Pop
  {
    id: 't16',
    title: 'Pixel Perfect',
    artist: 'Luna Park',
    album: 'Responsive',
    duration: 195,
    genre: 'pop',
    coverColor: 'from-blue-400 to-indigo-500',
    playCount: 5432,
    createdAt: new Date(now - 0.5 * day),
  },
  {
    id: 't17',
    title: 'Tailwind Hearts',
    artist: 'Luna Park',
    album: 'Responsive',
    duration: 221,
    genre: 'pop',
    coverColor: 'from-indigo-400 to-sky-500',
    playCount: 4321,
    createdAt: new Date(now - 0.5 * day),
  },
  {
    id: 't18',
    title: 'Component Chemistry',
    artist: 'Prism',
    album: 'Render Cycle',
    duration: 237,
    genre: 'pop',
    coverColor: 'from-sky-400 to-cyan-500',
    playCount: 3654,
    createdAt: new Date(now - 2 * day),
  },
  {
    id: 't19',
    title: 'Type Safe Love',
    artist: 'Prism',
    album: 'Render Cycle',
    duration: 189,
    genre: 'pop',
    coverColor: 'from-blue-300 to-indigo-400',
    playCount: 2876,
    createdAt: new Date(now - 2 * day),
  },
  {
    id: 't20',
    title: 'First Contentful Paint',
    artist: 'Morning Glow',
    album: 'Core Web Vitals',
    duration: 214,
    genre: 'pop',
    coverColor: 'from-indigo-500 to-blue-700',
    playCount: 1987,
    createdAt: new Date(now - 8 * day),
  },
  // Lo-fi
  {
    id: 't21',
    title: 'Slow Build',
    artist: 'Rainfall',
    album: 'Sunday Deploys',
    duration: 278,
    genre: 'lo-fi',
    coverColor: 'from-blue-500 to-slate-600',
    playCount: 2543,
    createdAt: new Date(now - 3 * day),
  },
  {
    id: 't22',
    title: 'Console Calm',
    artist: 'Rainfall',
    album: 'Sunday Deploys',
    duration: 302,
    genre: 'lo-fi',
    coverColor: 'from-sky-600 to-blue-700',
    playCount: 1876,
    createdAt: new Date(now - 3 * day),
  },
  {
    id: 't23',
    title: 'Soft Reset',
    artist: 'Tape Hiss',
    album: 'Dev Diary',
    duration: 264,
    genre: 'lo-fi',
    coverColor: 'from-cyan-400 to-blue-500',
    playCount: 1234,
    createdAt: new Date(now - 12 * day),
  },
  {
    id: 't24',
    title: 'Idle Thread',
    artist: 'Tape Hiss',
    album: 'Dev Diary',
    duration: 231,
    genre: 'lo-fi',
    coverColor: 'from-blue-400 to-sky-500',
    playCount: 1567,
    createdAt: new Date(now - 12 * day),
  },
  {
    id: 't25',
    title: 'npm install sleep',
    artist: 'Dusty Vinyl',
    album: 'Downtime',
    duration: 198,
    genre: 'lo-fi',
    coverColor: 'from-indigo-300 to-blue-400',
    playCount: 987,
    createdAt: new Date(now - 15 * day),
  },
  // Synthwave
  {
    id: 't26',
    title: 'Neon Terminal',
    artist: 'Grid Runner',
    album: 'After Dark',
    duration: 345,
    genre: 'synthwave',
    coverColor: 'from-blue-600 to-indigo-800',
    playCount: 876,
    createdAt: new Date(now - 6 * day),
  },
  {
    id: 't27',
    title: 'Retro Compiler',
    artist: 'Grid Runner',
    album: 'After Dark',
    duration: 298,
    genre: 'synthwave',
    coverColor: 'from-sky-500 to-indigo-600',
    playCount: 654,
    createdAt: new Date(now - 6 * day),
  },
  {
    id: 't28',
    title: 'Cyber Monday',
    artist: 'LaserType',
    album: 'Digital Sunset',
    duration: 276,
    genre: 'synthwave',
    coverColor: 'from-blue-500 to-cyan-600',
    playCount: 543,
    createdAt: new Date(now - 9 * day),
  },
  {
    id: 't29',
    title: 'Chrome Dreams',
    artist: 'LaserType',
    album: 'Digital Sunset',
    duration: 312,
    genre: 'synthwave',
    coverColor: 'from-indigo-400 to-blue-600',
    playCount: 432,
    createdAt: new Date(now - 9 * day),
  },
  {
    id: 't30',
    title: 'Midnight Deploy',
    artist: 'Scanline',
    album: 'Production Mode',
    duration: 287,
    genre: 'synthwave',
    coverColor: 'from-cyan-500 to-indigo-600',
    playCount: 765,
    createdAt: new Date(now - 14 * day),
  },
  // Extra electronic
  {
    id: 't31',
    title: 'Race Condition',
    artist: 'Neon Pulse',
    album: 'Event Loop',
    duration: 224,
    genre: 'electronic',
    coverColor: 'from-cyan-500 to-blue-600',
    playCount: 612,
    createdAt: new Date(now - 16 * day),
  },
  {
    id: 't32',
    title: 'Deadlock',
    artist: 'Chrome Echo',
    album: 'Concurrency',
    duration: 256,
    genre: 'electronic',
    coverColor: 'from-blue-500 to-indigo-600',
    playCount: 489,
    createdAt: new Date(now - 17 * day),
  },
  {
    id: 't33',
    title: 'Backpressure',
    artist: 'Subroutine',
    album: 'Streams',
    duration: 301,
    genre: 'electronic',
    coverColor: 'from-sky-500 to-cyan-600',
    playCount: 412,
    createdAt: new Date(now - 18 * day),
  },
  // Extra indie
  {
    id: 't34',
    title: 'Commit Message',
    artist: 'Margin Notes',
    album: 'Pull Request',
    duration: 198,
    genre: 'indie',
    coverColor: 'from-sky-400 to-blue-500',
    playCount: 587,
    createdAt: new Date(now - 19 * day),
  },
  {
    id: 't36',
    title: 'Force Push',
    artist: 'Reflog',
    album: 'Lost Commits',
    duration: 267,
    genre: 'indie',
    coverColor: 'from-blue-400 to-indigo-500',
    playCount: 432,
    createdAt: new Date(now - 21 * day),
  },
  // Extra hip-hop
  {
    id: 't37',
    title: 'Cache Hit',
    artist: 'BLKSMTH',
    album: 'Memoize',
    duration: 187,
    genre: 'hip-hop',
    coverColor: 'from-indigo-500 to-blue-600',
    playCount: 891,
    createdAt: new Date(now - 22 * day),
  },
  {
    id: 't39',
    title: 'Null Pointer',
    artist: 'Null Pointer',
    album: 'Segfault',
    duration: 245,
    genre: 'hip-hop',
    coverColor: 'from-blue-600 to-indigo-700',
    playCount: 654,
    createdAt: new Date(now - 24 * day),
  },
  // Extra pop
  {
    id: 't40',
    title: 'Vibe Coding',
    artist: 'Sprint Velocity',
    album: 'Velocity',
    duration: 189,
    genre: 'pop',
    coverColor: 'from-sky-400 to-cyan-500',
    playCount: 1203,
    createdAt: new Date(now - 25 * day),
  },
  {
    id: 't42',
    title: 'PR Approved',
    artist: 'Code Review',
    album: 'LGTM',
    duration: 195,
    genre: 'pop',
    coverColor: 'from-blue-300 to-sky-400',
    playCount: 843,
    createdAt: new Date(now - 27 * day),
  },
  // Extra lo-fi
  {
    id: 't43',
    title: 'Localhost Lullaby',
    artist: 'Port 3000',
    album: 'Dev Server',
    duration: 278,
    genre: 'lo-fi',
    coverColor: 'from-cyan-400 to-sky-500',
    playCount: 562,
    createdAt: new Date(now - 28 * day),
  },
  {
    id: 't44',
    title: 'Stack Trace',
    artist: 'Heap Dump',
    album: 'Postmortem',
    duration: 312,
    genre: 'lo-fi',
    coverColor: 'from-blue-500 to-sky-600',
    playCount: 478,
    createdAt: new Date(now - 29 * day),
  },
  // Extra synthwave
  {
    id: 't46',
    title: 'CRT Glow',
    artist: 'VHS Stack',
    album: 'Retro Mode',
    duration: 298,
    genre: 'synthwave',
    coverColor: 'from-indigo-500 to-blue-700',
    playCount: 689,
    createdAt: new Date(now - 31 * day),
  },
  {
    id: 't47',
    title: 'Modem Handshake',
    artist: 'Dial-Up',
    album: '56k',
    duration: 245,
    genre: 'synthwave',
    coverColor: 'from-blue-600 to-indigo-800',
    playCount: 534,
    createdAt: new Date(now - 32 * day),
  },
  {
    id: 't48',
    title: 'BIOS Boot',
    artist: 'Kernel Panic',
    album: 'POST',
    duration: 271,
    genre: 'synthwave',
    coverColor: 'from-slate-500 to-blue-700',
    playCount: 467,
    createdAt: new Date(now - 33 * day),
  },
];

type SeedPlaylist = {
  id: string;
  name: string;
  description: string;
  coverColor: string;
  trackIds: string[];
};

const PLAYLISTS: SeedPlaylist[] = [
  {
    id: 'pl1',
    name: 'Late Night Coding',
    description: 'Beats for the midnight commit.',
    coverColor: 'from-violet-500 to-purple-600',
    trackIds: ['t21', 't22', 't24', 't25', 't9'],
  },
  {
    id: 'pl2',
    name: 'Morning Vibes',
    description: 'Start the day right.',
    coverColor: 'from-purple-400 to-violet-500',
    trackIds: ['t6', 't7', 't16', 't17', 't23', 't20'],
  },
  {
    id: 'pl3',
    name: 'High Energy',
    description: 'Turn it up to eleven.',
    coverColor: 'from-fuchsia-500 to-purple-600',
    trackIds: ['t5', 't3', 't26', 't27', 't28', 't30', 't11', 't15'],
  },
];

async function main() {
  console.log('Seeding music player database...');

  await prisma.userTrackPlay.deleteMany();
  await prisma.userFavorite.deleteMany();
  await prisma.playlistTrack.deleteMany();
  await prisma.playlist.deleteMany();
  await prisma.track.deleteMany();
  await prisma.user.deleteMany();

  for (const t of TRACKS) {
    await prisma.track.create({ data: t });
  }
  console.log(`  ${TRACKS.length} tracks created`);

  for (const pl of PLAYLISTS) {
    await prisma.playlist.create({
      data: {
        id: pl.id,
        name: pl.name,
        description: pl.description,
        coverColor: pl.coverColor,
        createdAt: new Date(),
      },
    });
    for (let i = 0; i < pl.trackIds.length; i++) {
      await prisma.playlistTrack.create({
        data: {
          playlistId: pl.id,
          trackId: pl.trackIds[i],
          position: i,
        },
      });
    }
  }
  console.log(`  ${PLAYLISTS.length} playlists created`);

  await prisma.user.create({ data: { id: 'e2e', name: 'E2E Tester' } });
  console.log('  e2e test user created');

  console.log('Seed complete.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async e => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
