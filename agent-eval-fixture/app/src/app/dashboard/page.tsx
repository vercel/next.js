'use client'

import { useEffect, useMemo, useRef } from 'react'
import moment from 'moment'
import _ from 'lodash'
import Chart from 'chart.js/auto'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

const sales = [
  { region: 'North', amount: 120 },
  { region: 'South', amount: 85 },
  { region: 'North', amount: 95 },
  { region: 'West', amount: 140 },
]

export default function Dashboard() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const grouped = useMemo(() => _.groupBy(sales, 'region'), [])
  const highlighted = hljs.highlight('const total = sales.reduce(sum)', {
    language: 'javascript',
  }).value

  useEffect(() => {
    if (!canvas.current) return
    const chart = new Chart(canvas.current, {
      type: 'bar',
      data: {
        labels: sales.map((item) => item.region),
        datasets: [{ label: 'Sales', data: sales.map((item) => item.amount) }],
      },
    })
    return () => chart.destroy()
  }, [])

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Generated {moment().format('LLLL')}</p>
      <p>{Object.keys(grouped).length} regions</p>
      <canvas ref={canvas} width="500" height="220" />
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </main>
  )
}
