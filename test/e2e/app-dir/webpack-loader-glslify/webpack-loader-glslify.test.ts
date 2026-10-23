import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-glslify', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'glslify-loader': '2.0.0',
      'raw-loader': '4.0.2',
    },
  })

  it('compiles shared vertex and fragment shaders with glslify-loader', async () => {
    const $ = await next.render$('/')
    expect($('#vertex').text()).toContain('gl_Position = vec4(position, 1.0);')
    expect($('#fragment').text()).toContain('gl_FragColor = color()')
    expect($('#fragment').text()).toContain('return vec4(1.0);')
    expect($('#fragment').text()).not.toContain('#pragma glslify:')

    const browser = await next.browser('/')
    expect(await browser.elementByCss('#vertex').text()).toBe(
      $('#vertex').text()
    )
    expect(await browser.elementByCss('#fragment').text()).toBe(
      $('#fragment').text()
    )
  })
})
