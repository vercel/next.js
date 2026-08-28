import Link from 'next/link'
import { Suspense } from 'react'
import { fetchJobs } from '@/lib/jobs'

async function JobsTable() {
  const { jobs, fetchedAt } = await fetchJobs()
  return (
    <>
      <p>Data refreshed {fetchedAt}</p>
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Site</th>
            <th>Task</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <Link href={`/jobs/${job.id}`}>#{job.id}</Link>
              </td>
              <td>{job.site}</td>
              <td>{job.task}</td>
              <td>{job.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export default function JobsPage() {
  return (
    <main>
      <h1>Jobs</h1>
      <Suspense fallback={<p>Loading jobs…</p>}>
        <JobsTable />
      </Suspense>
    </main>
  )
}
