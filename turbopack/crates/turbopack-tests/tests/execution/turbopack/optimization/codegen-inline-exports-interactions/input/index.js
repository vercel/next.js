import { ANALYZED, late } from 'inline-values'
import { forced } from 'inline-values' with { turbopackConstants: 'true' }
import { annotationOff } from 'inline-values' with { turbopackConstants: 'false' }

if (ANALYZED) require('./analysis-marker')
if (forced) require('./forced-marker')
if (late !== 'dev') require('./late-marker')
if (annotationOff !== 'off') require('./annotation-off-marker')

function readAnalyzed() {
  return ANALYZED
}

function readLate() {
  return late
}

function readAnnotationOff() {
  return annotationOff
}

it('preserves analyzer-aware precedence and falls back to codegen-only inlining', () => {
  expect(readAnalyzed()).toBe(false)
  expect(readLate()).toBe('dev')
  expect(readAnnotationOff()).toBe('off')

  expect(readAnalyzed.toString()).toContain('TURBOPACK compile-time value')
  expect(readLate.toString()).toContain('TURBOPACK compile-time value')
  expect(readLate.toString()).not.toContain('late')
  expect(readAnnotationOff.toString()).not.toContain('annotationOff')

  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/analysis-marker\.js/)
  )
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/forced-marker\.js/)
  )
  expect(modules).toContainEqual(
    expect.stringMatching(/input\/late-marker\.js/)
  )
  expect(modules).toContainEqual(
    expect.stringMatching(/input\/annotation-off-marker\.js/)
  )
})
