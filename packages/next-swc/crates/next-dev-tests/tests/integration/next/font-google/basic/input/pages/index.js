import { useEffect } from 'react'
import { Inter } from 'next/font/google'

const interNoArgs = Inter()
const interWithVariableName = Inter({
  variable: '--my-font',
})

export default function Home() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return <div className={interNoArgs.className}>Test</div>
}

function runTests() {
  it('returns structured data about the font styles from the font function', () => {
    expect(interNoArgs).toEqual({
      className: 'className__inter_34ab8b4d__7bdff866',
      style: {
        fontFamily: "'__Inter_34ab8b', '__Inter_Fallback_34ab8b'",
        fontStyle: 'normal',
      },
    })
  })

  it('includes a rule styling the exported className', async () => {
    const matchingRule = await getRuleMatchingClassName(interNoArgs.className)
    expect(matchingRule).toBeTruthy()
    expect(matchingRule.style.fontFamily).toEqual(
      '__Inter_34ab8b, __Inter_Fallback_34ab8b'
    )
    expect(matchingRule.style.fontStyle).toEqual('normal')
  })

  it('supports declaring a css custom property (css variable)', async () => {
    expect(interWithVariableName).toEqual({
      className: 'className__inter_c6e282f1__e152ac0c',
      style: {
        fontFamily: "'__Inter_c6e282', '__Inter_Fallback_c6e282'",
        fontStyle: 'normal',
      },
      variable: 'variable__inter_c6e282f1__e152ac0c',
    })

    const matchingRule = await getRuleMatchingClassName(
      interWithVariableName.variable
    )
    expect(matchingRule.styleMap.get('--my-font').toString().trim()).toBe(
      '"__Inter_c6e282", "__Inter_Fallback_c6e282"'
    )
  })
}

async function getRuleMatchingClassName(className) {
  const selector = `.${CSS.escape(className)}`

  for (const stylesheet of document.querySelectorAll('link[rel=stylesheet]')) {
    if (stylesheet.sheet == null) {
      // Wait for the stylesheet to load completely if it hasn't already
      await new Promise((resolve) => {
        stylesheet.addEventListener('load', resolve)
      })
    }

    const sheet = stylesheet.sheet

    const res = getRuleMatchingClassNameRec(selector, sheet.cssRules)
    if (res != null) {
      return res
    }
  }

  return null
}

function getRuleMatchingClassNameRec(selector, rules) {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule && rule.selectorText === selector) {
      return rule
    }

    if (rule instanceof CSSLayerBlockRule) {
      const res = getRuleMatchingClassNameRec(selector, rule.cssRules)
      if (res != null) {
        return res
      }
    }
  }

  return null
}
