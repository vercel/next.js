'use client'

import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { fas } from '@fortawesome/free-solid-svg-icons'
import { format } from 'date-fns'
import * as locales from 'date-fns/locale'

export default function ReportsPage() {
  const chart = useRef<HTMLDivElement>(null)
  const editor = useRef<HTMLDivElement>(null)
  const [editorLoaded, setEditorLoaded] = useState(false)

  useEffect(() => {
    if (!chart.current) return
    const instance = echarts.init(chart.current)
    instance.setOption({
      xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: [12, 20, 15] }],
    })
    return () => instance.dispose()
  }, [])

  async function loadEditor() {
    if (!editor.current || editorLoaded) return
    const monaco = await import('monaco-editor')
    monaco.editor.create(editor.current, {
      value: 'const total = 47',
      language: 'javascript',
      minimap: { enabled: false },
    })
    setEditorLoaded(true)
  }

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>
        <FontAwesomeIcon icon={fas.faChartBar} /> Quarterly report
      </h1>
      <p>{format(new Date('2026-09-18'), 'PPP', { locale: locales.enUS })}</p>
      <p>
        Loaded registries: {Object.keys(fas).length} icons,{' '}
        {Object.keys(locales).length} locales, {Object.keys(echarts).length}{' '}
        chart exports.
      </p>
      <div ref={chart} style={{ width: 640, height: 320 }} />
      <button onClick={loadEditor}>Open formula editor</button>
      <div ref={editor} style={{ width: 640, height: 240, marginTop: 16 }} />
    </main>
  )
}
