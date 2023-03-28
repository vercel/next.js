import downsampler from 'downsample-lttb'
import asciichart from 'asciichart'
import terminalSize from 'term-size'

const CHART_WIDTH = terminalSize().columns - 15 // space for the labels

function getMetrics(data) {
  const sorted = [...data].sort((a, b) => a - b)
  const getPercentile = (percentile) => {
    const index = Math.floor((sorted.length - 1) * percentile)
    return sorted[index]
  }
  return {
    hits: sorted.length,
    confidenceInterval: round(getConfidenceInterval(sorted)),
    median: getPercentile(0.5),
    avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p75: getPercentile(0.75),
    p95: getPercentile(0.95),
    p99: getPercentile(0.99),
    p25: getPercentile(0.25),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

function round(num) {
  return Math.round(num * 100) / 100
}

// thanks Copilot
function getConfidenceInterval(data) {
  const n = data.length
  const m = data.reduce((a, b) => a + b) / n
  const s = Math.sqrt(
    data.map((x) => Math.pow(x - m, 2)).reduce((a, b) => a + b) / n
  )
  const z = 1.96 // 95% confidence
  const e = z * (s / Math.sqrt(n))
  return e
}

export function downsample(data, maxPoints) {
  const sortedData = [...data].sort((a, b) => a - b)
  return downsampler
    .processData(
      // the downsampler expects a 2d array of [x, y] values, so we need to add an index
      sortedData.map((p, i) => [p, i]),
      maxPoints
    )
    .map((p) => p[0])
}

export function printBenchmarkResults({ origin, head }, metricSelector) {
  const [processedOriginData, processedHeadData] = [origin, head].map(
    (results) => results.map(metricSelector).filter(Boolean)
  )

  if (processedHeadData.length === 0 || processedOriginData.length === 0) {
    console.log('No data to compare, skipping')
    return
  }

  const [originMetrics, headMetrics] = [
    processedOriginData,
    processedHeadData,
  ].map(getMetrics)

  const deltaMetrics = {
    min: headMetrics.min - originMetrics.min,
    max: headMetrics.max - originMetrics.max,
    avg: headMetrics.avg - originMetrics.avg,
    median: headMetrics.median - originMetrics.median,
    p95: headMetrics.p95 - originMetrics.p95,
    p99: headMetrics.p99 - originMetrics.p99,
    p75: headMetrics.p75 - originMetrics.p75,
    p25: headMetrics.p25 - originMetrics.p25,
  }

  console.table({
    origin: originMetrics,
    head: headMetrics,
    delta: deltaMetrics,
  })

  const [originData, headData] = [processedOriginData, processedHeadData].map(
    (data) =>
      downsample(
        data,
        Math.min(
          CHART_WIDTH,
          processedOriginData.length,
          processedHeadData.length
        )
      )
  )

  console.log(
    asciichart.plot([originData, headData], {
      height: 15,
      colors: [asciichart.blue, asciichart.red],
    })
  )
}
