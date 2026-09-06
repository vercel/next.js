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
import IconArchive from '../ui/icons/archive'
import IconBarChart from '../ui/icons/bar-chart'
import IconBellOff from '../ui/icons/bell-off'
import IconBox from '../ui/icons/box'
import IconCalendarDays from '../ui/icons/calendar-days'
import IconCheck from '../ui/icons/check'
import IconChevronLeft from '../ui/icons/chevron-left'
import IconChevronUp from '../ui/icons/chevron-up'
import IconChevronsUpDown from '../ui/icons/chevrons-up-down'
import IconCircleDot from '../ui/icons/circle-dot'
import IconCloud from '../ui/icons/cloud'
import IconCode from '../ui/icons/code'
import IconCommand from '../ui/icons/command'
import IconCopy from '../ui/icons/copy'
import IconCreditCard from '../ui/icons/credit-card'
import IconDownload from '../ui/icons/download'
import IconEye from '../ui/icons/eye'
import IconFileCode from '../ui/icons/file-code'
import IconFlame from '../ui/icons/flame'
import IconGauge from '../ui/icons/gauge'
import IconGitCommit from '../ui/icons/git-commit'
import IconGitMerge from '../ui/icons/git-merge'
import IconGitPullRequest from '../ui/icons/git-pull-request'
import IconHardDrive from '../ui/icons/hard-drive'
import IconInbox from '../ui/icons/inbox'
import IconKey from '../ui/icons/key'
import IconLifeBuoy from '../ui/icons/life-buoy'
import IconListFilter from '../ui/icons/list-filter'
import IconLoader from '../ui/icons/loader'
import IconMapPin from '../ui/icons/map-pin'
import IconMonitor from '../ui/icons/monitor'
import IconPackage from '../ui/icons/package'
import IconPause from '../ui/icons/pause'
import IconPlug from '../ui/icons/plug'
import IconPlus from '../ui/icons/plus'
import IconServer from '../ui/icons/server'
import IconSliders from '../ui/icons/sliders'
import IconStar from '../ui/icons/star'
import IconTag from '../ui/icons/tag'
import IconTimer from '../ui/icons/timer'
import IconUpload from '../ui/icons/upload'
import IconWifi from '../ui/icons/wifi'
import IconWrench from '../ui/icons/wrench'
import DateRangePicker from '../ui/date-range-picker'
import SortHeader from '../ui/sort-header'
import ColumnPicker from '../ui/column-picker'
import FilterChip from '../ui/filter-chip'
import SavedViews from '../ui/saved-views'
import RegionSelect from '../ui/region-select'
import RefreshButton from '../ui/refresh-button'
import PresenceAvatars from '../ui/presence-avatars'
import UsageAlert from '../ui/usage-alert'
import BillingMeter from '../ui/billing-meter'
import InviteMember from '../ui/invite-member'
import ApiToken from '../ui/api-token'
import LogViewer from '../ui/log-viewer'
import DeployActions from '../ui/deploy-actions'
import ChartLegend from '../ui/chart-legend'
import TableDensity from '../ui/table-density'
import IncidentBanner from '../ui/incident-banner'
import FeedbackButton from '../ui/feedback-button'
import HelpMenu from '../ui/help-menu'
import KeyboardHint from '../ui/keyboard-hint'
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
  people,
  logLines,
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
      <div
        className="panel-body relative flex min-h-0 flex-col"
        data-scroll-root
      >
        <div className="scroll-area relative flex-1 overflow-hidden">
          <div
            className="scroll-viewport h-full w-full overflow-auto overscroll-contain"
            data-orientation="vertical"
          >
            <div className="table-frame relative min-w-max" data-table-root>
              <div className="table-toolbar-context" data-density="comfortable">
                <div className="virtualizer relative" data-virtualized="false">
                  <div className="size-observer relative min-w-0">
                    <table className="deploy-table">
                      <thead>
                        <tr>
                          <th>
                            <SortHeader
                              label="Deployment"
                              icon={<IconChevronsUpDown size={11} />}
                            />
                          </th>
                          <th>Status</th>
                          <th>Commit</th>
                          <th>By</th>
                          <th>
                            <SortHeader
                              label="Took"
                              icon={<IconChevronsUpDown size={11} />}
                            />
                          </th>
                          <th>Region</th>
                          <th>
                            <SortHeader
                              label="Created"
                              icon={<IconChevronsUpDown size={11} />}
                            />
                          </th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {deployments.map((d) => (
                          <DeploymentRow key={d.id} d={d} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Pagination pages={6} />
      <a href="#" className="text-xs text-muted flex items-center gap-2">
        <IconChevronUp size={12} /> Back to top
      </a>
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
    <div className="panel-body relative flex min-h-0 flex-col" data-scroll-root>
      <div className="scroll-area relative flex-1 overflow-hidden">
        <div className="scroll-viewport h-full w-full overflow-auto overscroll-contain">
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
                  <td className={CELL_CLASS + ' mono'} data-col="project">
                    <span className={CELL_INNER_CLASS} data-slot="cell">
                      {dom.project}
                    </span>
                  </td>
                  <td>
                    <StatusBadge
                      status={dom.ssl === 'active' ? 'ready' : 'queued'}
                    />
                  </td>
                  <td className={CELL_CLASS} data-col="registrar">
                    <span className={CELL_INNER_CLASS} data-slot="cell">
                      {dom.registrar}
                    </span>
                  </td>
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
        </div>
      </div>
    </div>
  )
}

async function DeferredActivity() {
  await sleep(16)
  return (
    <ul className="activity">
      {activity.map((a) => (
        <li
          key={a.id}
          data-event={a.id}
          data-actor={a.actor.username}
          className={LIST_ITEM_CLASS}
        >
          <Avatar name={a.actor.name} hue={a.actor.avatarHue} size={20} />
          <span className="min-w-0 flex-1 truncate">
            <span className="who" title={'@' + a.actor.username}>
              {a.actor.name}
            </span>{' '}
            {a.verb}{' '}
            <span className="mono" title={a.target}>
              {a.target}
            </span>{' '}
            {a.suffix}
          </span>
          <RelativeTime date={a.at} now={NOW} />
        </li>
      ))}
    </ul>
  )
}

export const dynamic = 'force-dynamic'

// Repeated utility-class strings, the way compiled Tailwind markup ships
// long className runs on every row and cell.
const ROW_CLASS =
  'group relative flex w-full items-center gap-3 border-b border-neutral-200 px-3 py-2 text-sm leading-5 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 data-[state=error]:bg-red-50 dark:border-neutral-800 dark:hover:bg-neutral-900'
const CELL_CLASS =
  'relative flex min-w-0 select-none items-center gap-2 truncate whitespace-nowrap px-2 py-1.5 text-sm leading-5 tabular-nums text-neutral-600 transition-colors group-hover:text-neutral-900 group-data-[state=error]:text-red-700 dark:text-neutral-300 dark:group-hover:text-neutral-50'
const CELL_INNER_CLASS =
  'cell-inner relative inline-flex min-w-0 max-w-full items-center gap-1.5 truncate align-middle'
const LIST_ITEM_CLASS =
  'relative flex items-start gap-2 border-b border-neutral-100 py-1.5 text-sm leading-5 last:border-0 hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900'
const CARD_CLASS =
  'group relative flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950'

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
    'Observability',
    [
      ['Monitoring', IconMonitor, false],
      ['Tracing', IconGauge, false],
      ['Errors', IconFlame, false],
      ['Cron jobs', IconTimer, false],
      ['Queues', IconInbox, false],
      ['Source maps', IconFileCode, false],
    ],
  ],
  [
    'Infrastructure',
    [
      ['Compute', IconServer, false],
      ['Blob storage', IconHardDrive, false],
      ['Cache', IconBox, false],
      ['CDN', IconCloud, false],
      ['Artifacts', IconPackage, false],
      ['Secrets', IconKey, false],
    ],
  ],
  [
    'Settings',
    [
      ['Domains', IconGlobe, false],
      ['Environment variables', IconLock, false],
      ['Integrations', IconLayers, false],
      ['Connected apps', IconPlug, false],
      ['Notifications', IconBellOff, false],
      ['Tags & labels', IconTag, false],
      ['Maintenance', IconWrench, false],
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
              <Icon
                size={14}
                className="shrink-0 text-neutral-500 group-hover:text-neutral-800"
              />{' '}
              {label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  )
}

function ProjectCard({ p }) {
  return (
    <article
      className={'project-card ' + CARD_CLASS}
      data-project={p.id}
      data-status={p.status}
      aria-label={p.name}
    >
      <header className="flex items-center gap-2 truncate" title={p.name}>
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
        <IconGlobe size={13} />{' '}
        <a
          href={'https://' + p.domain}
          className="truncate hover:underline"
          title={'https://' + p.domain}
          rel="noopener"
        >
          {p.domain}
        </a>
      </p>
      <p
        className="flex items-center gap-2 truncate text-sm text-muted"
        title={p.lastCommit}
      >
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
    <tr
      data-testid={'deployment-row-' + d.id}
      data-state={d.status}
      data-url={d.url}
      className={ROW_CLASS}
      aria-labelledby={'commit-' + d.id}
    >
      <td
        className={CELL_CLASS}
        data-col="deployment"
        data-testid="cell-deployment"
      >
        <div
          className="commit-cell"
          data-testid="deployment-commit"
          aria-describedby={'status-' + d.id}
        >
          <span className="flex min-w-0 items-center gap-2" data-slot="cell">
            <span className={CELL_INNER_CLASS} data-slot="layout">
              <a
                id={'commit-' + d.id}
                href={d.url}
                title={d.commit}
                className="commit-msg truncate"
                rel="noopener"
              >
                <span className="truncate">{d.commit}</span>
              </a>
            </span>
          </span>
          <span className="branch mono" title={d.project + '/' + d.branch}>
            <span className="truncate">
              {d.project} · {d.branch}
            </span>
          </span>
        </div>
      </td>
      <td
        className={CELL_CLASS}
        data-col="status"
        data-testid="cell-status"
        id={'status-' + d.id}
      >
        <span className={CELL_INNER_CLASS} data-slot="cell">
          <span
            className="cell-layout flex items-center gap-2 truncate text-sm"
            data-slot="layout"
          >
            <StatusBadge status={d.status} note={d.statusNote} />
            {d.status === 'building' ? <IconLoader size={12} /> : null}
            {d.status === 'queued' ? <IconPause size={12} /> : null}
          </span>
        </span>
      </td>
      <td className={CELL_CLASS} data-col="commit" data-testid="cell-commit">
        <span className={CELL_INNER_CLASS} data-slot="cell" title={d.sha}>
          <span className="row-actions mono" data-slot="layout">
            <IconGitCommit size={12} />
            <a href={d.inspectorUrl} className="mono" data-sha={d.sha}>
              {d.sha.slice(0, 7)}
            </a>
            <CopyButton
              value={d.sha}
              label="Copy SHA"
              variant={d.copyVariant}
            />
          </span>
        </span>
      </td>
      <td className={CELL_CLASS} data-col="author" data-testid="cell-author">
        <span className={CELL_INNER_CLASS} data-slot="cell">
          <Tooltip text={d.author.name}>
            <Avatar
              name={d.author.name}
              hue={d.author.avatarHue}
              size={22}
              title={d.author.title}
            />
          </Tooltip>
        </span>
      </td>
      <td
        className={CELL_CLASS}
        data-col="duration"
        data-testid="cell-duration"
      >
        <span className={CELL_INNER_CLASS} data-slot="cell">
          <span
            className="cell-layout flex min-w-0 items-center gap-1"
            data-slot="layout"
            data-align="start"
          >
            <span
              className="cell-content truncate"
              data-slot="content"
              data-overflow="ellipsis"
              title="Build duration"
            >
              <span
                className="text-neutral-700 dark:text-neutral-200"
                data-slot="value"
              >
                {d.durationSeconds}s
              </span>
            </span>
          </span>
        </span>
      </td>
      <td
        className={CELL_CLASS + ' mono'}
        data-col="region"
        data-testid="cell-region"
      >
        <span className={CELL_INNER_CLASS} data-slot="cell">
          <span
            className="cell-layout flex min-w-0 items-center gap-1"
            data-slot="layout"
            data-align="start"
          >
            <span
              className="cell-content truncate"
              data-slot="content"
              data-overflow="ellipsis"
              title={d.region}
            >
              <span
                className="text-neutral-700 dark:text-neutral-200"
                data-slot="value"
              >
                {d.region}
              </span>
            </span>
          </span>
        </span>
      </td>
      <td className={CELL_CLASS} data-col="created" data-testid="cell-created">
        <span className={CELL_INNER_CLASS} data-slot="cell">
          <span
            className="cell-layout flex min-w-0 items-center gap-1"
            data-slot="layout"
            data-align="start"
          >
            <span
              className="cell-content truncate"
              data-slot="content"
              data-overflow="ellipsis"
            >
              <span
                className="text-neutral-700 dark:text-neutral-200"
                data-slot="value"
              >
                <RelativeTime date={d.createdAt} now={NOW} />
              </span>
            </span>
          </span>
        </span>
      </td>
      <td>
        <DeployActions
          promoteIcon={<IconUpload size={12} />}
          rollbackIcon={<IconChevronLeft size={12} />}
        />
        <Dropdown
          label="…"
          items={[
            {
              label: 'Visit',
              icon: (
                <IconExternalLink size={13} className="menu-icon shrink-0" />
              ),
            },
            {
              label: 'Inspect',
              icon: <IconTerminal size={13} className="menu-icon shrink-0" />,
            },
            {
              label: 'Promote to production',
              icon: <IconRocket size={13} className="menu-icon shrink-0" />,
            },
            {
              label: 'Redeploy',
              icon: <IconRefresh size={13} className="menu-icon shrink-0" />,
            },
            {
              label: 'Copy URL',
              icon: <IconGlobe size={13} className="menu-icon shrink-0" />,
            },
            {
              label: 'Copy SHA',
              icon: <IconCopy size={13} className="menu-icon shrink-0" />,
            },
            {
              label: 'Star',
              icon: <IconStar size={13} className="menu-icon shrink-0" />,
            },
            {
              label: 'Compare to previous',
              icon: <IconGitMerge size={13} className="menu-icon shrink-0" />,
            },
            {
              label: 'Open pull request',
              icon: (
                <IconGitPullRequest size={13} className="menu-icon shrink-0" />
              ),
            },
            {
              label: 'Archive',
              icon: <IconArchive size={13} className="menu-icon shrink-0" />,
            },
            {
              label: 'Delete',
              icon: <IconTrash size={13} className="menu-icon shrink-0" />,
            },
          ]}
        />
      </td>
    </tr>
  )
}

// A span tree from a traced request, rendered as nested markup the way
// tracing UIs draw waterfalls: each child span nests inside its parent.
const TRACE = [
  ['request GET /acme/overview', 184],
  ['middleware', 12],
  ['route resolution', 4],
  ['render app/acme/overview/page', 148],
  ['fetch /api/projects', 38],
  ['fetch /api/deployments', 61],
  ['dedupe cache lookup', 2],
  ['serialize flight payload', 19],
  ['stream shell', 8],
  ['flush deferred panels', 42],
  ['fetch /api/usage', 31],
  ['aggregate series', 6],
  ['stream panel html', 5],
  ['fetch /api/activity', 22],
  ['normalize events', 4],
  ['fetch /api/members', 18],
  ['authorize scopes', 3],
  ['render member list', 6],
  ['stream panel html', 4],
  ['finalize', 3],
]
function TraceWaterfall() {
  return (
    <figure className="trace" aria-label="Request trace">
      <figcaption className="text-xs text-muted">
        Trace · GET /acme/overview · 184ms
      </figcaption>
      {TRACE.reduceRight(
        (child, [label, ms], i) => (
          <div
            className="trace-span"
            data-depth={i}
            style={{ paddingLeft: 8 }}
            title={label + ' · ' + ms + 'ms'}
          >
            <span className="trace-label mono text-xs">
              {label} <em className="text-muted">{ms}ms</em>
            </span>
            {child}
          </div>
        ),
        null
      )}
    </figure>
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
        <PresenceAvatars people={people.slice(0, 5)} />
        <HelpMenu
          icon={<IconLifeBuoy size={15} />}
          items={[
            'Documentation',
            'Contact support',
            'Changelog',
            'Keyboard shortcuts',
          ]}
        />
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
          <IncidentBanner
            message="Elevated build queue times in sfo1."
            icon={<IconCircleDot size={13} />}
          />
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

          <UsageAlert
            message="Bandwidth is projected to reach 96% of the included allowance this period."
            icon={<IconAlertCircle size={13} />}
          />
          <UsageAlert
            message="Bandwidth is projected to reach 96% of the included allowance this period."
            icon={<IconAlertCircle size={13} />}
          />
          <section
            className="metric-grid"
            aria-label="Usage metrics"
            style={{ marginTop: 20 }}
          >
            {metrics.map((m) => (
              <article
                key={m.id}
                className="metric-card"
                data-metric={m.id}
                data-trend={m.trend}
                aria-label={m.label}
              >
                <h3 className="text-xs font-medium text-muted">{m.label}</h3>
                <p className="metric-value tabular-nums" title={m.label}>
                  {m.value}
                </p>
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
                <ColumnPicker
                  columns={[
                    'Status',
                    'Commit',
                    'By',
                    'Took',
                    'Region',
                    'Created',
                  ]}
                  icon={<IconSliders size={13} />}
                />
                <TableDensity icon={<IconListFilter size={13} />} />
                <RefreshButton
                  icon={<IconRefresh size={13} />}
                  label="Refresh deployments"
                />
              </div>
              <div
                className="flex items-center gap-2"
                style={{ marginBottom: 8 }}
              >
                <SavedViews
                  views={['All', 'Production', 'Previews', 'Failed']}
                />
                <FilterChip
                  label="branch: main"
                  icon={<IconGitBranch size={11} />}
                />
                <FilterChip
                  label="status: ready"
                  icon={<IconCheck size={11} />}
                />
                <FilterChip
                  label="region: iad1"
                  icon={<IconMapPin size={11} />}
                />
              </div>
              <Suspense fallback={<PanelSkeleton rows={12} />}>
                <DeferredDeployments />
              </Suspense>
            </section>

            <div>
              <section className="panel" aria-label="Usage">
                <div className="panel-head">
                  <h2>
                    <IconBarChart size={14} /> Requests · 90 days
                  </h2>
                  <div className="header-spacer" />
                  <DateRangePicker />
                </div>
                <ChartLegend
                  series={[
                    { label: 'Requests', color: 'hsl(220 70% 55%)' },
                    { label: 'Cached', color: 'hsl(160 60% 45%)' },
                    { label: 'Errors', color: 'hsl(0 70% 55%)' },
                  ]}
                />
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
              <section className="panel" aria-label="Runtime logs">
                <div className="panel-head">
                  <h2>
                    <IconCode size={14} /> Runtime logs
                  </h2>
                  <div className="header-spacer" />
                  <a
                    href="#"
                    className="text-xs text-muted"
                    aria-label="Download logs"
                  >
                    <IconDownload size={13} />
                  </a>
                </div>
                <LogViewer lines={logLines} />
                <TraceWaterfall />
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
                <RegionSelect
                  regions={['iad1', 'sfo1', 'fra1', 'hnd1', 'syd1']}
                  icon={<IconMapPin size={13} />}
                />
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
                <div className="header-spacer" />
                <InviteMember icon={<IconPlus size={13} />} />
              </div>
              <p className="flex items-center gap-2 text-xs text-muted">
                <IconKey size={13} /> Team token:{' '}
                <ApiToken
                  token="acme_k3y8f02mrq11xz74"
                  icon={<IconEye size={12} />}
                />
              </p>
              <ul className="member-list">
                {members.map((m, i) => (
                  <li
                    key={m.person.username + i}
                    data-member={m.person.username}
                    data-role={m.role}
                    className={LIST_ITEM_CLASS}
                  >
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
      <footer className="status-bar flex items-center gap-2 text-xs text-muted">
        <IconWifi size={12} /> All systems normal
        <span className="sep">·</span>
        <IconServer size={12} /> iad1
        <span className="sep">·</span>
        <IconCalendarDays size={12} /> Billing period ends in 12 days
        <BillingMeter
          spent={184}
          budget={400}
          icon={<IconCreditCard size={12} />}
        />
        <span className="header-spacer" />
        <FeedbackButton />
        <KeyboardHint icon={<IconCommand size={12} />} />
      </footer>
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
