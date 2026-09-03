import { getCurrentUserId } from '@/app/actions/auth'
import { getProjects, getProjectCount } from '@/app/actions/data'

// ─── DASHBOARD PAGE ─────────────────────────────────────
// This is the correct pattern:
//
//   1. getCurrentUserId() — runs every request, NOT cached.
//      Validates the JWT. Redirects to /login if invalid.
//
//   2. getProjects(userId) — cached by userId.
//      Different users get different cache entries.
//      Admin client + explicit filter = safe without cookies.
//
// The auth check and data fetch are SEPARATE boundaries.
// Auth: every request. Data: cached.
// ────────────────────────────────────────────────────────

export default async function DashboardPage() {
  // Step 1: Auth — always runs, never cached
  const userId = await getCurrentUserId()

  // Step 2: Data — cached, keyed by userId
  const [projects, count] = await Promise.all([
    getProjects(userId),
    getProjectCount(userId),
  ])

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Dashboard</h1>
      <p>User: {userId}</p>
      <p>Projects: {count}</p>
      <ul>
        {projects?.map((project) => (
          <li key={project.id}>
            {project.name} — {new Date(project.created_at).toLocaleDateString()}
          </li>
        ))}
      </ul>
      <form action="/app/actions/signout" method="post">
        <button type="submit">Sign Out</button>
      </form>
    </main>
  )
}
