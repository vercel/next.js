import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <button
        id="click-me"
        onClick={() =>
          router.push({
            pathname: '/query',
            query: {
              param1: '',
              param2: undefined,
              param3: null,
              param4: 0,
              param5: false,
              param6: [],
              param7: {},
              param8: NaN,
              param9: new Date(1234),
              param10: /hello/,
              param11: [
                '',
                undefined,
                null,
                0,
                false,
                [],
                {},
                NaN,
                new Date(1234),
                /hello/,
              ],
            },
          })
        }
      >
        Click me
      </button>
    </>
  )
}
