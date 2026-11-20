export async function startTelemetry() {
  const response = await fetch(
    `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT!}/v1/traces`,
    { method: 'POST' }
  )
  if (!response.ok) throw new Error('Failed to start telemetry')
}
