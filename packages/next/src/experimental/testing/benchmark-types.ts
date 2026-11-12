/** Statistics shared by benchmark baselines and reported tasks. */
interface BenchmarkStatistics {
  aad: number
  critical: number
  df: number
  mad: number
  max: number
  mean: number
  min: number
  moe: number
  p50: number
  p75: number
  p99: number
  p995: number
  p999: number
  rme: number
  samples:
    | ([number, ...number[]] & { readonly __sorted__: unique symbol })
    | undefined
  samplesCount: number
  sd: number
  sem: number
  variance: number
}

export interface BaselineData {
  latency: BenchmarkStatistics
  throughput: BenchmarkStatistics
  period: number
  totalTime: number
}

export interface BenchFromSource {
  (): BaselineData | Promise<BaselineData>
}

export interface TestBenchmarkTask extends BaselineData {
  name: string
  rank: number
  perProject?: boolean
  fromStore?: boolean
}

export interface TestBenchmark {
  name: string
  tasks: TestBenchmarkTask[]
}
