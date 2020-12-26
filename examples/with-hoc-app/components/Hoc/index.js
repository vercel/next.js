export const checkIsMobile = (req) => {
  let userAgent

  if (req) {
    userAgent = req.headers['user-agent']
  } else {
    userAgent = navigator.userAgent
  }

  return Boolean(
    userAgent?.match(
      /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i
    )
  )
}

// eslint-disable-next-line import/no-anonymous-default-export
export default (WrappedComponent) => {
  const HOC = (props) => <WrappedComponent {...props} />
  HOC.getInitialProps = async ({ req }) => {
    const isMobile = checkIsMobile(req)
    if (WrappedComponent.getInitialProps) {
      return WrappedComponent.getInitialProps({
        isMobile,
      })
    }

    return {
      isMobile,
    }
  }
  return HOC
}
