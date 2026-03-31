interface TimestampDisplayProps {
  data: {
    timestamp: number
    random?: number
    instanceId?: string
    source?: string
  }
  renderTime: number
}

export function TimestampDisplay({ data, renderTime }: TimestampDisplayProps) {
  const latency = renderTime - data.timestamp

  return (
    <div className="timestamp-display">
      <div className="row">
        <span className="label">Generated At:</span>
        <span>{new Date(data.timestamp).toISOString()}</span>
      </div>
      <div className="row">
        <span className="label">Rendered At:</span>
        <span>{new Date(renderTime).toISOString()}</span>
      </div>
      <div className="row">
        <span className="label">Cache Age:</span>
        <span>{latency}ms</span>
      </div>
      {data.random !== undefined && (
        <div className="row">
          <span className="label">Random Value:</span>
          <span>{data.random.toFixed(6)}</span>
        </div>
      )}
      {data.instanceId && (
        <div className="row">
          <span className="label">Instance ID:</span>
          <span>{data.instanceId}</span>
        </div>
      )}
      {data.source && (
        <div className="row">
          <span className="label">Source:</span>
          <span>{data.source}</span>
        </div>
      )}
    </div>
  )
}
