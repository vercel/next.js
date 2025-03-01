import type {
  InferGetServerSidePropsType,
  GetServerSidePropsContext,
} from 'next'
import { expectTypeOf } from 'expect-type'

describe('InferGetServerSidePropsType', () => {
  it('should work with sync functions', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function getServerSideProps(context: GetServerSidePropsContext) {
      if (context.params?.notFound) {
        return {
          notFound: true,
        }
      }

      return {
        props: {
          foo: 'bar',
        },
      }
    }

    type PageProps = InferGetServerSidePropsType<typeof getServerSideProps>

    expectTypeOf<PageProps>().toEqualTypeOf<{ foo: string }>()
  })

  it('should work with async functions', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async function getServerSideProps(context: GetServerSidePropsContext) {
      if (context.params?.notFound) {
        return {
          notFound: true,
        }
      }

      if (context.params?.redirect) {
        return {
          redirect: {
            destination: '/',
          },
        }
      }

      return {
        props: {
          foo: 'bar',
        },
      }
    }

    type PageProps = InferGetServerSidePropsType<typeof getServerSideProps>

    expectTypeOf<PageProps>().toEqualTypeOf<{ foo: string }>()
  })

  it('should work with promised props', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async function getServerSideProps() {
      return {
        props: Promise.resolve({
          foo: 'bar',
        }),
      }
    }

    type PageProps = InferGetServerSidePropsType<typeof getServerSideProps>

    expectTypeOf<PageProps>().toEqualTypeOf<{ foo: string }>()
  })
})
