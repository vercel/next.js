import cookie from 'cookie';
import { v4 as uuidv4 } from 'uuid';
import React, { useMemo } from 'react';
import { TesfyProvider, createInstance } from 'react-tesfy';
import Nav from '../components/nav';

const App = ({ Component, pageProps, datafile, userId }) => {
  const engine = useMemo(() => {
    return createInstance({ datafile, userId });
  }, []);

  return (
    <TesfyProvider engine={engine}>
      <Nav/>
      <main>
        <p>Your user identifier is <b>{engine.getUserId()}</b>. Delete <b>user_id</b> cookie and refresh to get a new one</p>
        <Component {...pageProps} />
      </main>
    </TesfyProvider>
  )
};

// Fetch your configuration from tesfy cdn or your own server
const getDatafile = () => {
  return {
    experiments: {
      'experiment-1': {
        id: 'experiment-1',
        percentage: 90,
        variations: [{
          id: '0',
          percentage: 50
        }, {
          id: '1',
          percentage: 50
        }]
      },
      'experiment-2': {
        id: 'experiment-2',
        percentage: 100,
        variations: [{
          id: '0',
          percentage: 100
        }],
        audience: {
          '==' : [{ var : 'countryCode' }, 'us']
        }
      }
    },
    features: {
      'feature-1': {
        id: 'feature-1',
        percentage: 50
      }
    }
  };
}

const getUserId = (ctx) => {
  const { req, res } = ctx;

  const cookies = cookie.parse(req.headers.cookie ?? '');
  let userId = cookies['user_id'];

  if (!userId) {
    userId = uuidv4();
    res.setHeader('Set-Cookie', cookie.serialize('user_id', userId, { httpOnly: true }));
  }

  return userId;
}

App.getInitialProps = ({ ctx, ...others }) => {
  const isServer = ctx.req && ctx.res;

  if (isServer) {
    const datafile = getDatafile();
    const userId = getUserId(ctx);

    return { datafile, userId };
  }

  return {};
};

export default App;