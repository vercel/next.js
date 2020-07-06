module.exports = {
  purge: ['./components/**/*.js', './pages/**/*.js'],
  theme: {
    extend: {
      colors: {
        'accent-1': '#FAFAFA',
        'accent-2': '#EAEAEA',
        'accent-5': '#666666',
        'accent-7': '#333333',
        success: '#0070f3',
        cyan: '#79FFE1',
        error: '#FF1A1A',
      },
      spacing: {
        28: '7rem',
        full: '100%',
      },
      letterSpacing: {
        tighter: '-.04em',
      },
      lineHeight: {
        tight: 1.2,
      },
      fontSize: {
        '5xl': '2.5rem',
        '6xl': '2.75rem',
        '7xl': '4.5rem',
        '8xl': '6.25rem',
      },
      boxShadow: {
        small: '0 5px 10px rgba(0, 0, 0, 0.12)',
        medium: '0 8px 30px rgba(0, 0, 0, 0.12)',
      },
      gridTemplateColumns: {
        'p-1': 'minmax(0, 24rem)',
        'p-images': 'repeat(auto-fill, 4.5rem)',
      },
    },
  },
}
