import { useEffect } from 'react'
import { select, selectAll } from 'd3-selection'

export default function Home() {
  useEffect(() => {
    new MyClass()
  }, [])

  return (
    <svg>
      <g className="group">
        <path />
        <path />
      </g>

      <g className="group">
        <path />
        <path />
      </g>
    </svg>
  )
}

class MyClass {
  constructor() {
    selectAll('.group').each(function () {
      select(this).selectAll('path')
    })
  }
}
