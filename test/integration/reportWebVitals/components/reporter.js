'use client'
import 'client-only'
import { useReportWebVitals } from 'next/client'

const report = (metric) => {
  console.log(metric)
}

export default function Reporter() {
  useReportWebVitals(report)
}
