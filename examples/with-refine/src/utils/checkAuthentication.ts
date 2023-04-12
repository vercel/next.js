import { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { authProvider } from 'src/authProvider'

export const checkAuthentication = async (
  context: GetServerSidePropsContext
): Promise<
  GetServerSidePropsResult<{}> & {
    isAuthenticated: boolean
  }
> => {
  let isAuthenticated = false
  if (context.resolvedUrl.includes('/login')) {
    return {
      props: {},
      isAuthenticated,
    }
  }

  try {
    await authProvider.check?.(context)
    isAuthenticated = true
  } catch (error) {
    const encodeURI = () => {
      if (context.resolvedUrl === '/' || context.resolvedUrl === undefined) {
        return '/login'
      }

      return `/login?to=${encodeURIComponent(context.resolvedUrl)}`
    }

    return {
      isAuthenticated,
      redirect: {
        destination: encodeURI(),
        permanent: false,
      },
    }
  }

  return { props: {}, isAuthenticated }
}
