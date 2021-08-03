import withJoi from 'next-joi'

export const validate = withJoi({
  /**
   * By default, `next-joi` will return a 400 HTTP error code but
   * we can customize the error response.
   */
  onValidationError: (_, res) => {
    return res.status(418).json({ message: "I'm a Teapot" })
  },
})
