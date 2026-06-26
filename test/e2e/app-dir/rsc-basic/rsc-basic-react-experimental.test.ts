import { nextTestSetup } from 'e2e-utils'

describe('react@experimental', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.js': `
        module.exports = {
          experimental: {
            taint: true,
          }
        }
      `,
    },
  })

  it('should opt into the react@experimental when enabling $flag', async () => {
    const resPages$ = await next.render$('/app-react')
    const [
      ssrReact,
      ssrReactDOM,
      ssrClientReact,
      ssrClientReactDOM,
      ssrClientReactDOMServer,
    ] = [
      resPages$('#react').text(),
      resPages$('#react-dom').text(),
      resPages$('#client-react').text(),
      resPages$('#client-react-dom').text(),
      resPages$('#client-react-dom-server').text(),
    ]
    expect({
      ssrReact,
      ssrReactDOM,
      ssrClientReact,
      ssrClientReactDOM,
      ssrClientReactDOMServer,
    }).toEqual({
      ssrReact: expect.stringMatching('-experimental-'),
      ssrReactDOM: expect.stringMatching('-experimental-'),
      ssrClientReact: expect.stringMatching('-experimental-'),
      ssrClientReactDOM: expect.stringMatching('-experimental-'),
      ssrClientReactDOMServer: expect.stringMatching('-experimental-'),
    })

    const browser = await next.browser('/app-react')
    const [
      browserReact,
      browserReactDOM,
      browserClientReact,
      browserClientReactDOM,
      browserClientReactDOMServer,
    ] = await browser.eval(`
      [
        document.querySelector('#react').innerText,
        document.querySelector('#react-dom').innerText,
        document.querySelector('#client-react').innerText,
        document.querySelector('#client-react-dom').innerText,
        document.querySelector('#client-react-dom-server').innerText,
      ]
    `)
    expect({
      browserReact,
      browserReactDOM,
      browserClientReact,
      browserClientReactDOM,
      browserClientReactDOMServer,
    }).toEqual({
      browserReact: expect.stringMatching('-experimental-'),
      browserReactDOM: expect.stringMatching('-experimental-'),
      browserClientReact: expect.stringMatching('-experimental-'),
      browserClientReactDOM: expect.stringMatching('-experimental-'),
      browserClientReactDOMServer: expect.stringMatching('-experimental-'),
    })
  })
})
