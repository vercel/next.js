import type { Interface } from '../index.js'
import os from 'os'
import {
  CPU_ARCH,
  CPU_MODEL,
  GIT_BRANCH,
  GIT_SHA,
  IS_CI,
  NODE_VERSION,
  NUM_CPUS,
  OS,
  OS_RELEASE,
  USERNAME,
} from './constants.js'
import { randomUUID } from 'crypto'

type DevlowMetric = {
  event_time: number
  scenario: string
  props: Record<string, string | number | boolean | null>
  metric: string
  value: number
  unit: string
  relative_to?: string
  is_ci: boolean
  os: string
  os_release: string
  cpus: number
  cpu_model: string
  user: string
  arch: string
  total_memory_bytes: number
  node_version: string
  git_sha: string
  git_branch: string
}

export default function createInterface({
  gatewayUri = process.env.SNOWFLAKE_BATCH_URI,
  topicName = process.env.SNOWFLAKE_TOPIC_NAME,
  schemaId = process.env.SNOWFLAKE_SCHEMA_ID
    ? parseInt(process.env.SNOWFLAKE_SCHEMA_ID, 10)
    : undefined,
}: {
  gatewayUri?: string
  topicName?: string
  schemaId?: number
} = {}): Interface {
  if (!gatewayUri)
    throw new Error(
      'Snowflake gateway URI is required (set SNOWFLAKE_GATEWAY_URI)'
    )
  if (!topicName)
    throw new Error(
      'Snowflake topic name is required (set SNOWFLAKE_TOPIC_NAME)'
    )
  if (!schemaId)
    throw new Error(
      'Snowflake schema ID is required (set SNOWFLAKE_SCHEMA_ID to a valid integer)'
    )

  const records: DevlowMetric[] = []
  const iface: Interface = {
    measurement: async (scenario, props, name, value, unit, relativeTo) => {
      records.push({
        event_time: Date.now(),
        scenario,
        props,
        metric: name,
        value,
        unit,
        relative_to: relativeTo,
        is_ci: IS_CI,
        os: OS,
        os_release: OS_RELEASE,
        cpus: NUM_CPUS,
        cpu_model: CPU_MODEL,
        user: USERNAME,
        arch: CPU_ARCH,
        total_memory_bytes: os.totalmem(),
        node_version: NODE_VERSION,
        git_sha: GIT_SHA,
        git_branch: GIT_BRANCH,
      })
    },
    end: async (scenario, props) => {
      await trackAnalytics(gatewayUri, topicName, schemaId, records)
    },
  }
  return iface
}

async function trackAnalytics(
  batchUri: string,
  topic: string,
  schemaId: number,
  records: DevlowMetric[]
): Promise<void> {
  try {
    const res = await fetch(batchUri, {
      method: 'POST',
      headers: {
        'Client-Id': 'nextjs',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schema_id: schemaId,
        topic,
        records: records.map((record) =>
          omit(
            {
              ...record,
              id: randomUUID(),
              props_json: JSON.stringify(record.props),
            },
            ['props']
          )
        ),
      }),
    })
    if (!res.ok) {
      throw new Error(
        `Unexpected HTTP response from reporting ${topic} event to Snowflake: ${res.status}. Body: ${await res.text()}`
      )
    }
  } catch (e) {
    const wrappedError = new Error('Unexpected error tracking analytics event')
    wrappedError.cause = e
    console.error(wrappedError)
  }
}

export function omit<T extends { [key: string]: unknown }, K extends keyof T>(
  object: T,
  keys: K[]
): Omit<T, K> {
  const omitted: { [key: string]: unknown } = {}
  Object.keys(object).forEach((key) => {
    if (!keys.includes(key as K)) {
      omitted[key] = object[key]
    }
  })
  return omitted as Omit<T, K>
}
