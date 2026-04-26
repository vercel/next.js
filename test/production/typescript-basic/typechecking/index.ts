import 'next/app'
// FIXME
// import 'next/babel';
import 'next/cache'
import 'next/client'
import 'next/constants'
import 'next/document'
import 'next/dynamic'
import 'next/error'
import 'next/head'
import 'next/headers'
import 'next/image'
import 'next'
// TODO @jest/types is an undeclared peer dependecy
// import 'next/jest';
import 'next/link'
import 'next/navigation'
import 'next/og'
import 'next/router'
import 'next/script'
import 'next/server'
import type { useReportWebVitals } from 'next/web-vitals'

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0]
type WebVitalsMetric = Parameters<ReportWebVitalsCallback>[0]
type WebVitalsMetricName = WebVitalsMetric['name']

const webVitalsMetricName: WebVitalsMetricName = 'CLS'
// @ts-expect-error - metric.name should not allow arbitrary strings.
const invalidWebVitalsMetricName: WebVitalsMetricName = 'custom'

void webVitalsMetricName
void invalidWebVitalsMetricName
