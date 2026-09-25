'use client'

import './widget.css'
import { fromSourceMap } from '../lib/source'

export function Widget() {
  return <span className="widget">{fromSourceMap('client')}</span>
}
