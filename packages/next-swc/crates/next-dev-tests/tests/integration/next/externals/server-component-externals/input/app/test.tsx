'use client'

import value from 'package'
import value2 from 'package/cjs'
import 'package/style.css'

import { useTestHarness } from '@turbo/pack-test-harness'

export default function Test() {
  useTestHarness(runTests)

  return (
    <div id="test">
      {value} {value2}
    </div>
  )
}

function runTests() {
  it("serverComponentsExternalPackages should be external if they're cjs modules", () => {
    expect(value).toBe(42)
    expect(value2).toBe(42)

    const el = document.getElementById('test')
    expect(el).not.toBeNull()

    expect(el!.textContent).toBe('42 42')
  })

  it('serverComponentsExternalPackages should not apply to CSS', () => {
    const el = document.getElementById('test')
    expect(el).not.toBeNull()

    expect(getComputedStyle(el!).display).toBe('none')
  })
}
