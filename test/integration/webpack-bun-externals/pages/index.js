// This page tests that Bun modules are properly externalized
export default function Page() {
  return <div>Webpack Bun Externals Test</div>
}

export async function getServerSideProps() {
  const results = {}

  try {
    require('bun:ffi')
    results['bun:ffi'] = 'loaded'
  } catch (e) {
    results['bun:ffi'] = 'external (not found)'
  }

  try {
    require('bun:jsc')
    results['bun:jsc'] = 'loaded'
  } catch (e) {
    results['bun:jsc'] = 'external (not found)'
  }

  try {
    require('bun:sqlite')
    results['bun:sqlite'] = 'loaded'
  } catch (e) {
    results['bun:sqlite'] = 'external (not found)'
  }

  try {
    require('bun:test')
    results['bun:test'] = 'loaded'
  } catch (e) {
    results['bun:test'] = 'external (not found)'
  }

  try {
    require('bun:wrap')
    results['bun:wrap'] = 'loaded'
  } catch (e) {
    results['bun:wrap'] = 'external (not found)'
  }

  try {
    require('bun')
    results['bun'] = 'loaded'
  } catch (e) {
    results['bun'] = 'external (not found)'
  }

  return { props: { results } }
}
