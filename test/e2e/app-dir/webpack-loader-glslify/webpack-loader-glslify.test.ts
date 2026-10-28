import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-glslify', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'glslify-loader': '2.0.0',
      'raw-loader': '4.0.2',
      sass: '1.54.0',
    },
    env: {
      // Reuse one loader worker across the shader and stylesheet transforms.
      TURBO_TASKS_AVAILABLE_PARALLELISM: '1',
    },
  })

  it('keeps shader and stylesheet results separate when reusing a loader worker', async () => {
    // Compile in this order in dev so the stylesheet cannot be consumed as the
    // next shader's loader result after a dependency-tracking failure.
    const vertexResponse = await next.fetch('/vertex')
    const stylesheetResponse = await next.fetch('/stylesheet')
    const fragmentResponse = await next.fetch('/fragment')
    expect(fragmentResponse.status).toBe(200)
    expect(vertexResponse.status).toBe(200)
    expect(stylesheetResponse.status).toBe(200)

    const $vertex = await next.render$('/vertex')
    const $fragment = await next.render$('/fragment')
    expect($vertex('#vertex').text()).toContain(
      'gl_Position = vec4(position, 1.0);'
    )
    expect($fragment('#fragment').text()).toContain('gl_FragColor = color()')
    expect($fragment('#fragment').text()).toContain('return vec4(1.0);')
    expect($fragment('#fragment').text()).not.toContain('#pragma glslify:')

    const browser = await next.browser('/vertex')
    expect(await browser.elementByCss('#vertex').text()).toBe(
      $vertex('#vertex').text()
    )
    await browser.loadPage(next.url + '/fragment')
    expect(await browser.elementByCss('#fragment').text()).toBe(
      $fragment('#fragment').text()
    )
    await browser.loadPage(next.url + '/stylesheet')
    expect(await browser.elementByCss('#styled').getComputedCss('color')).toBe(
      'rgb(255, 0, 0)'
    )
  })
})
