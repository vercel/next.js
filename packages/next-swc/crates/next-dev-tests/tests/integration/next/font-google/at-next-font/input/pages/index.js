import { Inter } from '@next/font/google'
import { useTestHarness } from '@turbo/pack-test-harness'

const interNoArgs = Inter()

export default function Home() {
  useTestHarness(runTests)

  return <div className={interNoArgs.className}>Test</div>
}

function runTests() {
  it('continues to be able to import from `@next/font/google`', () => {
    expect(interNoArgs).toEqual({
      className: 'className__inter_34ab8b4d__7bdff866',
      style: {
        fontFamily: "'__Inter_34ab8b', '__Inter_Fallback_34ab8b'",
        fontStyle: 'normal',
      },
    })
  })
}
