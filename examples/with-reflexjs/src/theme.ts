import { Theme } from 'reflexjs'

const theme: Theme = {
  useRootStyles: true,
  initialColorModeName: 'light',
  colors: {
    text: '#191924',
    background: '#fff',
    primary: '#06f',
    border: '#ebece9',
    modes: {
      dark: {
        text: '#ededee',
        background: '#1a202c',
        primary: '#06f',
        border: '#2a2a3c',
      },
    },
  },
  breakpoints: ['640px', '768px', '1024px', '1280px'],
  fonts: {
    body: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji',
    heading: 'inherit',
    monospace:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
  },
  fontSizes: {
    sm: '0.875rem',
    md: '1rem',
    lg: '3rem',
  },
  fontWeights: {
    normal: 400,
    medium: 500,
    bold: 700,
  },
  space: {
    0: '0',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    7: '1.75rem',
    8: '2rem',
    9: '2.25rem',
    10: '2.5rem',
  },
  sizes: {
    0: '0',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    7: '1.75rem',
    8: '2rem',
    9: '2.25rem',
    10: '2.5rem',
    auto: 'auto',
    half: '50%',
    full: '100%',
    screen: '100vw',
  },
  borders: [0, '1px solid'],
  radii: {
    none: '0',
    sm: '0.125rem',
    md: '0.25rem',
    lg: '0.375rem',
    xl: '0.5rem',
  },
  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    lg: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  },
  gridTemplateColumns: {
    none: 'none',
    1: 'repeat(1, minmax(0, 1fr))',
    2: 'repeat(2, minmax(0, 1fr))',
    3: 'repeat(3, minmax(0, 1fr))',
  },
  gridTemplateRows: {
    none: 'none',
    1: 'repeat(1, minmax(0, 1fr))',
    2: 'repeat(2, minmax(0, 1fr))',
    3: 'repeat(3, minmax(0, 1fr))',
  },
  styles: {
    root: {
      fontFamily: 'body',
      fontSize: 16,
      lineHeight: 'normal',
      fontFeatureSettings: "'kern'",
      textRendering: 'optimizeLegibility',
      WebkitFontSmoothing: 'antialiased',
      '*': {
        listStyle: 'none',
        border: '0 solid',
        borderColor: 'border',
        m: 0,
        p: 0,

        '::selection': {
          bg: 'selection',
        },
      },
      body: {
        color: 'text',
        fontFamily: 'body',
        fontWeight: 'normal',
        fontSize: 'md',
        lineHeight: 'relaxed',
        letterSpacing: 'normal',
      },
    },
  },

  // Variants.
  text: {
    paragraph: {
      fontSize: 'lg',
      my: 8,
      lineHeight: 8,
    },
  },

  heading: {
    color: 'heading',
    fontFamily: 'heading',
    fontWeight: 'semibold',
    lineHeight: 'tight',
    letterSpacing: 'tight',

    h1: {
      fontWeight: 'bold',
      lineHeight: '1.1',
      fontSize: 'lg',
    },
  },

  container: {
    px: '6|6|6|4',
    mx: 'auto',
    maxWidth: 1280,
  },

  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'text',
    bg: 'muted',
    fontFamily: 'body',
    fontSize: 'md',
    fontWeight: 'medium',
    lineHeight: 'none',
    textDecoration: 'none',
    border: '1px solid',
    borderColor: 'border',
    borderRadius: 'md',
    px: 4,
    py: 3,
    cursor: 'pointer',
    transition: 'all .15s ease-in',

    ':hover, :focus': {
      transform: 'translateY(-2px)',
      boxShadow: 'lg',
    },

    primary: {
      bg: 'primary',
      color: 'white',
      borderColor: 'primary',

      '&:hover, &:focus': {
        bg: 'primaryHover',
        color: 'white',
        borderColor: 'primaryHover',
        transform: 'translateY(-2px)',
        boxShadow: 'lg',
      },
    },
  },
}

export default theme
