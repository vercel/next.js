import React from 'react'

export const dynamic = 'force-dynamic'

const navigation = [
  ['Overview', '⌂'],
  ['Projects', '◫'],
  ['Deployments', '↗'],
  ['Analytics', '⌁'],
  ['Team', '◎'],
  ['Settings', '⚙'],
]

const metrics = [
  ['Total revenue', '$128,430', '+12.5%', 'emerald'],
  ['Active users', '24,892', '+8.2%', 'sky'],
  ['Conversion', '3.82%', '+0.4%', 'violet'],
  ['Incidents', '7', '-18.1%', 'amber'],
]

const projects = Array.from({ length: 18 }, (_, index) => ({
  name: `Storefront ${index + 1}`,
  environment: index % 3 === 0 ? 'Preview' : 'Production',
  branch: index % 2 === 0 ? 'main' : 'feature/checkout',
  updated: `${(index % 9) + 1}m ago`,
  progress: 58 + ((index * 7) % 39),
}))

const activity = Array.from({ length: 36 }, (_, index) => ({
  actor: [
    'Ada Lovelace',
    'Grace Hopper',
    'Linus Torvalds',
    'Margaret Hamilton',
  ][index % 4],
  action: ['deployed', 'commented on', 'merged', 'created'][index % 4],
  target: `storefront-${(index % 12) + 1}`,
  status: ['Ready', 'Building', 'Queued'][index % 3],
  time: `${index + 2} minutes ago`,
}))

function Sidebar() {
  return (
    <aside className="hidden border-r border-slate-200/80 bg-white/95 px-4 py-6 shadow-[inset_-1px_0_0_rgba(15,23,42,0.02)] backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center gap-3 px-3 text-sm font-semibold tracking-tight text-slate-950 dark:text-white">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-base font-black text-white shadow-lg shadow-violet-500/20 ring-1 ring-white/20">
          A
        </span>
        Acme Cloud
      </div>
      <nav className="mt-8 flex flex-1 flex-col gap-1.5" aria-label="Primary">
        {navigation.map(([label, icon], index) => (
          <a
            key={label}
            href={`#${label.toLowerCase()}`}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 ${
              index === 0
                ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span className="grid size-7 place-items-center rounded-md bg-white text-xs text-slate-500 shadow-sm ring-1 ring-slate-200 transition group-hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700">
              {icon}
            </span>
            <span className="truncate">{label}</span>
            {index === 2 ? (
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                12
              </span>
            ) : null}
          </a>
        ))}
      </nav>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-xs font-bold text-white ring-2 ring-white dark:ring-slate-900">
            AL
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ada Lovelace
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              ada@acme.test
            </p>
          </div>
          <button className="rounded-md p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700 hover:shadow-sm dark:hover:bg-slate-800 dark:hover:text-slate-200">
            •••
          </button>
        </div>
      </div>
    </aside>
  )
}

function MetricCard({ label, value, change, tone }) {
  const toneClasses = {
    emerald:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    sky: 'bg-sky-50 text-sky-700 ring-sky-600/10 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
    violet:
      'bg-violet-50 text-violet-700 ring-violet-600/10 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20',
    amber:
      'bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <div className="absolute -right-8 -top-8 size-24 rounded-full bg-gradient-to-br from-slate-100/80 to-transparent blur-2xl dark:from-slate-700/30" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950 tabular-nums dark:text-white sm:text-3xl">
            {value}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneClasses[tone]}`}
        >
          {change}
        </span>
      </div>
      <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_12px_rgba(139,92,246,0.35)]" />
      </div>
    </article>
  )
}

function ProjectCard({ project, index }) {
  return (
    <article className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/30 dark:hover:shadow-black/20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-md shadow-indigo-500/20 ring-1 ring-white/20">
            {project.name.slice(-2)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-950 group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-indigo-300">
              {project.name}
            </h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
              acme/{project.branch}
            </p>
          </div>
        </div>
        <button className="rounded-lg border border-transparent p-2 text-slate-400 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
          •••
        </button>
      </div>
      <div className="mt-5 flex items-center justify-between text-xs">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ring-1 ring-inset ${
            project.environment === 'Production'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20'
              : 'bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20'
          }`}
        >
          <span className="size-1.5 rounded-full bg-current shadow-[0_0_0_3px_currentColor] opacity-70" />
          {project.environment}
        </span>
        <span className="font-medium text-slate-400 dark:text-slate-500">
          {project.updated}
        </span>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span>Build progress</span>
          <span className="tabular-nums">{project.progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/50 dark:bg-slate-800 dark:ring-slate-700/50">
          <div
            className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ${
              index % 2 === 0
                ? 'from-indigo-500 to-violet-500'
                : 'from-cyan-500 to-blue-500'
            }`}
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>
    </article>
  )
}

function ActivityRow({ item, index }) {
  const statusClasses = {
    Ready:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    Building:
      'bg-sky-50 text-sky-700 ring-sky-600/10 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
    Queued:
      'bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20',
  }

  return (
    <tr className="group border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80 dark:border-slate-800/80 dark:hover:bg-slate-800/40">
      <td className="whitespace-nowrap px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] font-bold text-slate-600 ring-2 ring-white shadow-sm dark:from-slate-700 dark:to-slate-800 dark:text-slate-200 dark:ring-slate-900">
            {item.actor
              .split(' ')
              .map((part) => part[0])
              .join('')}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {item.actor}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {item.action}{' '}
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                {item.target}
              </span>
            </p>
          </div>
        </div>
      </td>
      <td className="hidden whitespace-nowrap px-5 py-3.5 text-xs font-medium text-slate-500 md:table-cell dark:text-slate-400">
        {item.time}
      </td>
      <td className="whitespace-nowrap px-5 py-3.5 text-right">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusClasses[item.status]}`}
        >
          {item.status}
        </span>
      </td>
      <td className="hidden w-10 px-3 py-3.5 text-right sm:table-cell">
        <button
          aria-label={`Open activity ${index + 1}`}
          className="rounded-md p-1.5 text-slate-300 opacity-0 transition hover:bg-white hover:text-slate-600 hover:shadow-sm group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          →
        </button>
      </td>
    </tr>
  )
}

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-950 antialiased selection:bg-indigo-200 selection:text-indigo-950 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] dark:bg-slate-950 dark:text-slate-100 dark:selection:bg-indigo-500/40 dark:selection:text-white">
      <Sidebar />
      <main className="min-w-0 overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-950/80 dark:supports-[backdrop-filter]:bg-slate-950/65">
          <button className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
            ☰
          </button>
          <div className="relative hidden max-w-md flex-1 sm:block">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              ⌕
            </span>
            <input
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-16 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-700 dark:focus:border-indigo-500 dark:focus:bg-slate-900"
              placeholder="Search projects and deployments..."
            />
            <kbd className="pointer-events-none absolute inset-y-0 right-2 my-auto inline-flex h-5 items-center rounded border border-slate-200 bg-white px-1.5 font-mono text-[10px] font-medium text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
              ⌘K
            </kbd>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:text-slate-900 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-white">
              ♧
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-slate-800 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:focus-visible:ring-white dark:focus-visible:ring-offset-slate-950">
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:inline">New project</span>
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[100rem] space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">
                <span className="h-px w-6 bg-indigo-400 dark:bg-indigo-500" />
                Workspace
              </div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                Good morning, Ada
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base dark:text-slate-400">
                Monitor deployments, review project health, and keep your team
                moving from one workspace.
              </p>
            </div>
            <div className="inline-flex w-fit items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {['7 days', '30 days', '90 days'].map((range, index) => (
                <button
                  key={range}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    index === 1
                      ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(([label, value, change, tone]) => (
              <MetricCard
                key={label}
                label={label}
                value={value}
                change={change}
                tone={tone}
              />
            ))}
          </section>

          <section aria-labelledby="projects-heading">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2
                  id="projects-heading"
                  className="text-lg font-bold tracking-tight text-slate-950 dark:text-white"
                >
                  Active projects
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Production and preview deployment status.
                </p>
              </div>
              <a
                href="#all-projects"
                className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
              >
                View all
                <span className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </a>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {projects.map((project, index) => (
                <ProjectCard
                  key={project.name}
                  project={project}
                  index={index}
                />
              ))}
            </div>
          </section>

          <section
            aria-labelledby="activity-heading"
            className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-col gap-4 border-b border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div>
                <h2
                  id="activity-heading"
                  className="text-base font-bold tracking-tight text-slate-950 dark:text-white"
                >
                  Recent activity
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Latest changes across your organization.
                </p>
              </div>
              <button className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:self-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                <span className="text-slate-400">≡</span>
                Filter activity
              </button>
            </div>
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[36rem] border-collapse text-left">
                <thead className="bg-slate-50/70 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:bg-slate-950/40 dark:text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Event</th>
                    <th className="hidden px-5 py-3 font-semibold md:table-cell">
                      Time
                    </th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Status
                    </th>
                    <th className="hidden px-3 py-3 sm:table-cell">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {activity.map((item, index) => (
                    <ActivityRow key={index} item={item} index={index} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/50 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
              <span>Showing 36 of 248 events</span>
              <div className="flex items-center gap-1">
                <button className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
                  Previous
                </button>
                <button className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
                  Next
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
