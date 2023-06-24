import { useTestHarness } from '@turbo/pack-test-harness'

export default function Home({ params }: { params: any }) {
  useTestHarness(() => runTests(params))

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
