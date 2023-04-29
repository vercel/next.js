import { useEffect } from 'react'

export default function Home({ params }: { params: any }) {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(() => runTests(params))
  })

  return <div>Test</div>
}

export function getServerSideProps(ctx: { params: any }) {
  return {
    props: {
      params: ctx.params,
    },
  }
}

function runTests(params: any) {
  describe('catch-all segments', () => {
    it('should be passed a param array', () => {
      expect(params.segment).toEqual('dynamic-segment')
    })
  })
}
