let message = '@next/font/local failed to run or is incorrectly configured.'
if (process.env.NODE_ENV === 'development') {
  message +=
    '\nIf you just installed `@next/font`, please try restarting `next dev` and resaving your file.'
}

throw new Error(message)
