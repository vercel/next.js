// Fetch your configuration from tesfy cdn or your own server
const getDatafile = () => {
  return {
    experiments: {
      'experiment-1': {
        id: 'experiment-1',
        percentage: 90,
        variations: [
          {
            id: '0',
            percentage: 50,
          },
          {
            id: '1',
            percentage: 50,
          },
        ],
      },
      'experiment-2': {
        id: 'experiment-2',
        percentage: 100,
        variations: [
          {
            id: '0',
            percentage: 100,
          },
        ],
        audience: {
          '==': [{ var: 'countryCode' }, 'us'],
        },
      },
    },
    features: {
      'feature-1': {
        id: 'feature-1',
        percentage: 50,
      },
    },
  }
}

export default getDatafile
