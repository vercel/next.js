'use client'
import { useReportWebVitals } from 'next/web-vitals'

const report = (metric) => {
  const blob = new Blob([new URLSearchParams(metric).toString()])
  const vitalsUrl = 'https://example.vercel.sh/vitals'
  fetch(vitalsUrl, {
    body: blob,
    method: 'POST',
    credentials: 'omit',
    keepalive: true,
  })
}

export default function Reporter() {
  useReportWebVitals(report)
}
