let message = '@next/font/local failed to run.'
if (process.env.NODE_ENV === 'development') {
  message +=
    '\nIf you just installed `@next/font`, please try rerunning `next dev`'
}

throw new Error(message)
