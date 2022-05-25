// @ts-ignore JSON
import { version as nextVersion } from 'next/package.json'

const EVENT_NEXT_DEV_CRASH_REPORT = 'NEXT_DEV_CRASH_REPORT'
type NextDevCrashReport = {
  eventName: string
  payload: {
    error: string
    nextVersion: string
    nodeVersion: string
  }
}

export function eventCrashReport(error: string): NextDevCrashReport {
  return {
    eventName: EVENT_NEXT_DEV_CRASH_REPORT,
    payload: {
      error,
      nextVersion,
      nodeVersion: process.versions.node,
    },
  }
}
