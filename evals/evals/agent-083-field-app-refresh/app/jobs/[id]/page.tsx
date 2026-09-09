import Link from 'next/link'
import { Suspense } from 'react'
import { fetchJob } from '@/lib/jobs'

async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { job, fetchedAt } = await fetchJob(Number(id))
  if (!job) {
    return <p>Job not found.</p>
  }
  return (
    <>
      <p>Data refreshed {fetchedAt}</p>
      <dl>
        <dt>Site</dt>
        <dd>{job.site}</dd>
        <dt>Task</dt>
        <dd>{job.task}</dd>
        <dt>Status</dt>
        <dd>{job.status}</dd>
      </dl>
    </>
  )
}

export default function JobPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <main>
      <h1>Job detail</h1>
      <Suspense fallback={<p>Loading job…</p>}>
        <JobDetail params={params} />
      </Suspense>
      <p>
        <Link href="/jobs">Back to jobs</Link>
      </p>
    </main>
  )
}
