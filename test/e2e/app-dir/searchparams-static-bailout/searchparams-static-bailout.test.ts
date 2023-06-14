import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'searchparams-static-bailout',
  {
    files: __dirname,
    dependencies: {
      nanoid: '4.0.1',
    },
  },
  ({ next, isNextStart }) => {
    describe('server component', () => {
      it('should bailout when using searchParams', async () => {
        const url = '/server-component-page?search=hello'
        const $ = await next.render$(url)
        expect($('h1').text()).toBe('Parameter: hello')

        // Check if the page is not statically generated.
        if (isNextStart) {
          const id = $('#nanoid').text()
          const $2 = await next.render$(url)
          const id2 = $2('#nanoid').text()
          expect(id).not.toBe(id2)
        }
      })

      it('should not bailout when not using searchParams', async () => {
        const url = '/server-component-without-searchparams?search=hello'

        const $ = await next.render$(url)
        expect($('h1').text()).toBe('No searchParams used')

        // Check if the page is not statically generated.
        if (isNextStart) {
          const id = $('#nanoid').text()
          const $2 = await next.render$(url)
          const id2 = $2('#nanoid').text()
          expect(id).toBe(id2)
        }
      })
    })

    describe('client component', () => {
      it('should bailout when using searchParams', async () => {
        const url = '/client-component-page?search=hello'
        const $ = await next.render$(url)
        expect($('h1').text()).toBe('Parameter: hello')

        // Check if the page is not statically generated.
        if (isNextStart) {
          const id = $('#nanoid').text()
          const $2 = await next.render$(url)
          const id2 = $2('#nanoid').text()
          expect(id).not.toBe(id2)
        }
      })

      it('should bailout when using searchParams is passed to client component', async () => {
        const url = '/client-component?search=hello'
        const $ = await next.render$(url)
        expect($('h1').text()).toBe('Parameter: hello')

        // Check if the page is not statically generated.
        if (isNextStart) {
          const id = $('#nanoid').text()
          const $2 = await next.render$(url)
          const id2 = $2('#nanoid').text()
          expect(id).not.toBe(id2)
        }
      })

      it('should not bailout when not using searchParams', async () => {
        const url = '/client-component-without-searchparams?search=hello'
        const $ = await next.render$(url)
        expect($('h1').text()).toBe('No searchParams used')

        // Check if the page is not statically generated.
        if (isNextStart) {
          const id = $('#nanoid').text()
          const $2 = await next.render$(url)
          const id2 = $2('#nanoid').text()
          expect(id).toBe(id2)
        }
      })
    })
  }
)
