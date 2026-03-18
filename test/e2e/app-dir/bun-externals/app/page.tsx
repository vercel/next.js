export default function Page() {
  // These should be handled as external modules
  // When not running in Bun, require() will throw "Cannot find module"
  let bunFfiStatus = 'not loaded'
  let bunJscStatus = 'not loaded'
  let bunSqliteStatus = 'not loaded'
  let bunTestStatus = 'not loaded'
  let bunWrapStatus = 'not loaded'
  let bunStatus = 'not loaded'

  try {
    require('bun:ffi')
    bunFfiStatus = 'loaded successfully'
  } catch (e: any) {
    // Expected error when not running in Bun
    bunFfiStatus = e.message.includes('Cannot find module')
      ? 'external (not found)'
      : 'error: ' + e.message
  }

  try {
    require('bun:jsc')
    bunJscStatus = 'loaded successfully'
  } catch (e: any) {
    bunJscStatus = e.message.includes('Cannot find module')
      ? 'external (not found)'
      : 'error: ' + e.message
  }

  try {
    require('bun:sqlite')
    bunSqliteStatus = 'loaded successfully'
  } catch (e: any) {
    bunSqliteStatus = e.message.includes('Cannot find module')
      ? 'external (not found)'
      : 'error: ' + e.message
  }

  try {
    require('bun:test')
    bunTestStatus = 'loaded successfully'
  } catch (e: any) {
    bunTestStatus = e.message.includes('Cannot find module')
      ? 'external (not found)'
      : 'error: ' + e.message
  }

  try {
    require('bun:wrap')
    bunWrapStatus = 'loaded successfully'
  } catch (e: any) {
    bunWrapStatus = e.message.includes('Cannot find module')
      ? 'external (not found)'
      : 'error: ' + e.message
  }

  try {
    require('bun')
    bunStatus = 'loaded successfully'
  } catch (e: any) {
    bunStatus = e.message.includes('Cannot find module')
      ? 'external (not found)'
      : 'error: ' + e.message
  }

  return (
    <div>
      <h1>Bun Externals Test</h1>
      <div id="bun-ffi">{bunFfiStatus}</div>
      <div id="bun-jsc">{bunJscStatus}</div>
      <div id="bun-sqlite">{bunSqliteStatus}</div>
      <div id="bun-test">{bunTestStatus}</div>
      <div id="bun-wrap">{bunWrapStatus}</div>
      <div id="bun">{bunStatus}</div>
    </div>
  )
}
