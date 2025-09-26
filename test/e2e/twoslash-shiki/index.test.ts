import { nextTestSetup } from 'e2e-utils'

describe('twoslash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      shiki: '3.13.0',
      '@shikijs/twoslash': '3.13.0',
      twoslash: '0.3.4',
    },
  })

  it('should annotate twoslash types', async () => {
    const result = JSON.parse(await next.render('/'))

    expect(result).toMatchInlineSnapshot(`
     "<pre class="shiki vitesse-dark twoslash lsp" style="background-color:#121212;color:#dbd7caee" tabindex="0"><code><span class="line"></span>
     <span class="line"><span style="color:#CB7676">type</span><span style="color:#5DA994"> </span><span style="color:#5DA994"><span class="twoslash-hover"><span class="twoslash-popup-container"><code class="twoslash-popup-code"><span style="color:#CB7676">type</span><span style="color:#5DA994"> X</span><span style="color:#666666"> =</span><span style="color:#5DA994"> Promise</span><span style="color:#666666">&#x3C;</span><span style="color:#5DA994">number</span><span style="color:#666666">></span></code></span>X</span></span><span style="color:#666666"> =</span><span style="color:#5DA994"> </span><span style="color:#5DA994"><span class="twoslash-hover"><span class="twoslash-popup-container"><code class="twoslash-popup-code"><span style="color:#CB7676">interface</span><span style="color:#5DA994"> Promise</span><span style="color:#666666">&#x3C;</span><span style="color:#5DA994">T</span><span style="color:#666666">></span></code><div class="twoslash-popup-docs">Represents the completion of an asynchronous operation</div></span>Promise</span></span><span style="color:#666666">&#x3C;</span><span style="color:#5DA994">number</span><span style="color:#666666">></span></span>
     <span class="line"></span></code></pre>"
    `)
  })
})
