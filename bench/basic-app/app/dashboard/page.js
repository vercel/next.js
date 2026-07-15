// Models the SaaS-dashboard payload profile (calibrated against captured
// production dashboards): dozens of shared client-component modules
// (import rows with overlapping chunk lists), tables of structured rows
// mixing server markup with client atoms, a data series passed as props,
// and repeated skeleton/status strings.
import '../bench.css'
import Avatar from '../ui/avatar'
import StatusBadge from '../ui/status-badge'
import Dropdown from '../ui/dropdown'
import Tooltip from '../ui/tooltip'
import CopyButton from '../ui/copy-button'
import Tabs from '../ui/tabs'
import SearchInput from '../ui/search-input'
import SparkChart from '../ui/spark-chart'
import Pagination from '../ui/pagination'
import ThemeToggle from '../ui/theme-toggle'
import RelativeTime from '../ui/relative-time'
import UsageMeter from '../ui/usage-meter'
import NotificationBell from '../ui/notification-bell'
import CommandMenu from '../ui/command-menu'
import Toggle from '../ui/toggle'
import AlertBanner from '../ui/alert-banner'
import PreviewImage from '../ui/preview-image'
import IconGitBranch from '../ui/icons/git-branch'
import IconGlobe from '../ui/icons/globe'
import IconAlertCircle from '../ui/icons/alert-circle'
import IconArrowUpRight from '../ui/icons/arrow-up-right'
import IconChevronDown from '../ui/icons/chevron-down'
import IconExternalLink from '../ui/icons/external-link'
import IconTerminal from '../ui/icons/terminal'
import IconSettings from '../ui/icons/settings'
import IconFolder from '../ui/icons/folder'
import IconActivity from '../ui/icons/activity'
import IconDatabase from '../ui/icons/database'
import IconShield from '../ui/icons/shield'
import IconZap from '../ui/icons/zap'
import IconRocket from '../ui/icons/rocket'
import IconLayers from '../ui/icons/layers'
import IconCpu from '../ui/icons/cpu'
import IconLock from '../ui/icons/lock'
import IconUsers from '../ui/icons/users'
import IconChartBar from '../ui/icons/chart-bar'
import IconRefresh from '../ui/icons/refresh'
import IconTrash from '../ui/icons/trash'
import IconMoreHorizontal from '../ui/icons/more-horizontal'
import { Suspense } from 'react'
import {
  viewer,
  deployments,
  metrics,
  usageSeries,
  activity,
  projects,
  domains,
  alerts,
  members,
  screenshots,
  NOW,
} from '../lib/data'

function sleep(ms) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function PanelSkeleton({ rows }) {
  return (
    <div className="panel-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton-row block relative overflow-hidden rounded animate-loading-skeleton"
        />
      ))}
    </div>
  )
}

// Panels resolve independently with small staggered delays, like a
// dashboard whose sections fetch from different backends, so the page
// streams through several flushes.
async function DeferredProjects() {
  await sleep(4)
  return (
    <div className="project-grid">
      {projects.map((p) => (
        <ProjectCard key={p.id} p={p} />
      ))}
    </div>
  )
}

async function DeferredDeployments() {
  await sleep(8)
  return (
    <>
      <table className="deploy-table">
        <thead>
          <tr>
            <th>Deployment</th>
            <th>Status</th>
            <th>Commit</th>
            <th>By</th>
            <th>Took</th>
            <th>Region</th>
            <th>Created</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {deployments.map((d) => (
            <DeploymentRow key={d.id} d={d} />
          ))}
        </tbody>
      </table>
      <Pagination pages={6} />
    </>
  )
}

async function DeferredUsage() {
  await sleep(12)
  return (
    <Tabs tabs={['Requests', 'Bandwidth', 'Errors']}>
      <SparkChart
        series={usageSeries}
        labels={{
          title: 'Edge requests over the last 90 days',
          caption: 'Hover a bar for daily totals. Blue is cache hits.',
        }}
      />
    </Tabs>
  )
}

async function DeferredDomains() {
  await sleep(10)
  return (
    <table className="deploy-table domain-table">
      <thead>
        <tr>
          <th>Domain</th>
          <th>Project</th>
          <th>SSL</th>
          <th>Registrar</th>
          <th>Expires</th>
          <th aria-label="Enabled" />
        </tr>
      </thead>
      <tbody>
        {domains.map((dom) => (
          <tr key={dom.id} data-testid={'domain-row-' + dom.id}>
            <td>
              <span className="flex items-center gap-2 truncate mono text-sm">
                {dom.name}
                {dom.verified ? null : (
                  <Tooltip text="Verification pending">
                    <IconAlertCircle size={13} />
                  </Tooltip>
                )}
              </span>
            </td>
            <td className="mono">{dom.project}</td>
            <td>
              <StatusBadge status={dom.ssl === 'active' ? 'ready' : 'queued'} />
            </td>
            <td>{dom.registrar}</td>
            <td>
              {dom.expiresAt ? (
                <RelativeTime date={dom.expiresAt} now={NOW} />
              ) : (
                <span className="text-xs text-muted">—</span>
              )}
            </td>
            <td>
              <Toggle defaultOn label={'Enable ' + dom.name} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

async function DeferredActivity() {
  await sleep(16)
  return (
    <ul className="activity">
      {activity.map((a) => (
        <li key={a.id}>
          <Avatar name={a.actor.name} hue={a.actor.avatarHue} size={20} />
          <span>
            <span className="who">{a.actor.name}</span> {a.verb}{' '}
            <span className="mono">{a.target}</span> {a.suffix}
          </span>
          <RelativeTime date={a.at} now={NOW} />
        </li>
      ))}
    </ul>
  )
}

export const dynamic = 'force-dynamic'

const NAV_SECTIONS = [
  [
    'Team',
    [
      ['Overview', IconActivity, true],
      ['Deployments', IconRocket, false],
      ['Analytics', IconChartBar, false],
      ['Logs', IconTerminal, false],
      ['Storage', IconDatabase, false],
      ['Edge Config', IconZap, false],
    ],
  ],
  [
    'Settings',
    [
      ['Domains', IconGlobe, false],
      ['Environment variables', IconLock, false],
      ['Integrations', IconLayers, false],
      ['Usage & billing', IconCpu, false],
      ['Members', IconUsers, false],
      ['Security', IconShield, false],
      ['Project settings', IconSettings, false],
    ],
  ],
]

function Sidenav() {
  return (
    <nav className="sidenav">
      {NAV_SECTIONS.map(([section, items]) => (
        <div key={section}>
          <h4>{section}</h4>
          {items.map(([label, Icon, active]) => (
            <a
              key={label}
              href={
                '/acme/overview/' +
                section.toLowerCase() +
                '/' +
                label.toLowerCase().replace(/ /g, '-') +
                '?ref=sidenav&team=acme'
              }
              className={
                'flex items-center gap-2 truncate' + (active ? ' active' : '')
              }
              data-testid={'nav-' + label.toLowerCase().replace(/ /g, '-')}
            >
              <Icon size={14} /> {label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  )
}

function ProjectCard({ p }) {
  return (
    <article className="project-card">
      <header className="flex items-center gap-2 truncate">
        <IconFolder size={16} />
        <h3 className="truncate text-sm font-medium">{p.name}</h3>
        <span className="header-spacer" />
        <a href="#" aria-label={'Open ' + p.name}>
          <IconExternalLink size={14} />
        </a>
        <Dropdown
          label={<IconMoreHorizontal size={14} />}
          items={['View project', 'Settings', 'Transfer', 'Delete']}
        />
      </header>
      <p className="flex items-center gap-2 truncate text-sm text-muted">
        <IconGlobe size={13} /> {p.domain}
      </p>
      <p className="flex items-center gap-2 truncate text-sm text-muted">
        <IconGitBranch size={13} /> {p.lastCommit}
      </p>
      <footer className="flex items-center gap-2 truncate text-xs text-muted">
        <StatusBadge status={p.status} />
        <RelativeTime date={p.updatedAt} now={NOW} />
        <span className="header-spacer" />
        <span className="framework-pill">{p.framework}</span>
      </footer>
    </article>
  )
}

function DeploymentRow({ d }) {
  return (
    <tr data-testid={'deployment-row-' + d.id} data-state={d.status}>
      <td>
        <div
          className="commit-cell"
          data-testid="deployment-commit"
          aria-describedby={'status-' + d.id}
        >
          <span className="commit-msg">{d.commit}</span>
          <span className="branch mono">
            {d.project} · {d.branch}
          </span>
        </div>
      </td>
      <td>
        <span className="flex items-center gap-2 truncate text-sm">
          <StatusBadge status={d.status} note={d.statusNote} />
        </span>
      </td>
      <td>
        <span className="row-actions mono">
          {d.sha.slice(0, 7)}
          <CopyButton value={d.sha} label="Copy SHA" variant={d.copyVariant} />
        </span>
      </td>
      <td>
        <Tooltip text={d.author.name}>
          <Avatar
            name={d.author.name}
            hue={d.author.avatarHue}
            size={22}
            title={d.author.title}
          />
        </Tooltip>
      </td>
      <td>{d.durationSeconds}s</td>
      <td className="mono">{d.region}</td>
      <td>
        <RelativeTime date={d.createdAt} now={NOW} />
      </td>
      <td>
        <Dropdown
          label="…"
          items={[
            { label: 'Visit', icon: <IconExternalLink size={13} /> },
            { label: 'Inspect', icon: <IconTerminal size={13} /> },
            { label: 'Promote to production', icon: <IconRocket size={13} /> },
            { label: 'Redeploy', icon: <IconRefresh size={13} /> },
            { label: 'Copy URL', icon: <IconGlobe size={13} /> },
            { label: 'Delete', icon: <IconTrash size={13} /> },
          ]}
        />
      </td>
    </tr>
  )
}

export default function DashboardPage() {
  return (
    <>
      <header className="app-header">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Avatar name={viewer.team} hue={viewer.avatarHue} size={20} />
          <span>{viewer.team}</span>
          <span className="sep">/</span>
          <span className="current">Overview</span>
        </nav>
        <div className="header-spacer" />
        <SearchInput placeholder="Search deployments…" />
        <NotificationBell count={3} />
        <ThemeToggle />
        <Dropdown
          label={
            <span className="flex items-center gap-2">
              {viewer.name} <IconChevronDown size={12} />
            </span>
          }
          items={[
            'Dashboard',
            'Account settings',
            'Create team',
            'Theme',
            'Log out',
          ]}
        />
      </header>
      <div className="shell">
        <Sidenav />
        <main className="main">
          {alerts.map((a) => (
            <AlertBanner
              key={a.id}
              severity={a.severity}
              title={a.title}
              body={a.body}
              action={a.action}
              dismissible={a.dismissible}
            />
          ))}
          <section className="panel" aria-label="Projects">
            <div className="panel-head">
              <h2>Projects</h2>
              <div className="header-spacer" />
              <Dropdown
                label="Sort by activity"
                items={['Sort by activity', 'Sort by name', 'Sort by created']}
                align="end"
              />
            </div>
            <Suspense fallback={<PanelSkeleton rows={6} />}>
              <DeferredProjects />
            </Suspense>
          </section>

          <section
            className="metric-grid"
            aria-label="Usage metrics"
            style={{ marginTop: 20 }}
          >
            {metrics.map((m) => (
              <article key={m.id} className="metric-card">
                <h3>{m.label}</h3>
                <p className="metric-value">{m.value}</p>
                <p className={'metric-delta trend-' + m.trend}>
                  {m.trend === 'up' ? <IconArrowUpRight size={11} /> : null}
                  {m.delta} vs last period
                </p>
                <UsageMeter
                  fraction={m.quota}
                  label={m.label + ' quota used'}
                />
              </article>
            ))}
          </section>

          <div className="two-col">
            <section className="panel" aria-label="Deployments">
              <div className="panel-head">
                <h2>Deployments</h2>
                <div className="header-spacer" />
                <Dropdown
                  label="All projects"
                  items={[
                    'All projects',
                    'storefront',
                    'marketing-site',
                    'docs',
                    'api-gateway',
                  ]}
                  align="end"
                />
                <Dropdown
                  label="All branches"
                  items={['All branches', 'main', 'staging', 'Previews only']}
                  align="end"
                />
              </div>
              <Suspense fallback={<PanelSkeleton rows={12} />}>
                <DeferredDeployments />
              </Suspense>
            </section>

            <div>
              <section className="panel" aria-label="Usage">
                <div className="panel-head">
                  <h2>Requests · 90 days</h2>
                </div>
                <Suspense fallback={<PanelSkeleton rows={5} />}>
                  <DeferredUsage />
                </Suspense>
              </section>
              <section className="panel" aria-label="Recent activity">
                <div className="panel-head">
                  <h2>Activity</h2>
                </div>
                <Suspense fallback={<PanelSkeleton rows={8} />}>
                  <DeferredActivity />
                </Suspense>
              </section>
            </div>
          </div>

          <section className="panel" aria-label="Latest previews">
            <div className="panel-head">
              <h2>Latest previews</h2>
            </div>
            <div className="screenshot-grid">
              {screenshots.map((shot) => (
                <figure key={shot.project} className="m-0">
                  <PreviewImage
                    image={shot.image}
                    alt={'Latest preview of ' + shot.project}
                  />
                  <figcaption className="truncate text-xs text-muted">
                    {shot.project}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>

          <div className="two-col">
            <section className="panel" aria-label="Domains">
              <div className="panel-head">
                <h2>Domains</h2>
                <div className="header-spacer" />
                <Dropdown
                  label="Add domain"
                  items={['Add existing domain', 'Buy a domain', 'Transfer in']}
                  align="end"
                />
              </div>
              <Suspense fallback={<PanelSkeleton rows={7} />}>
                <DeferredDomains />
              </Suspense>
            </section>
            <section className="panel" aria-label="Team members">
              <div className="panel-head">
                <h2>Members</h2>
              </div>
              <ul className="member-list">
                {members.map((m, i) => (
                  <li key={m.person.username + i}>
                    <Avatar
                      name={m.person.name}
                      hue={m.person.avatarHue}
                      size={22}
                    />
                    <span className="truncate">{m.person.name}</span>
                    <span className="role-pill">{m.role}</span>
                    <span className="header-spacer" />
                    {m.lastActiveAt ? (
                      <RelativeTime date={m.lastActiveAt} now={NOW} />
                    ) : (
                      <span className="text-xs text-muted">never</span>
                    )}
                    <Toggle
                      defaultOn={m.mfa}
                      label={'MFA for ' + m.person.name}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </main>
      </div>
      <CommandMenu
        commands={[
          'Go to deployments',
          'Go to analytics',
          'Search docs',
          'Switch team',
          'Toggle theme',
          'Log out',
        ]}
      />
    </>
  )
}
