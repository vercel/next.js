'use client'
import { useReportWebVitals } from 'next/client'

const report = (metric) => {
  const blob = new Blob([new URLSearchParams(metric).toString()])
  const vitalsUrl = 'https://vitals.vercel-insights.com/v1/vitals'
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
