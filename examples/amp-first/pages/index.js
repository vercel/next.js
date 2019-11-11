import React from 'react'
import Layout from '../components/Layout'
import AmpState from '../components/amp/AmpState'
import AmpScript from '../components/amp/AmpScript'
import {
  AmpIncludeAmpList,
  AmpIncludeAmpCarousel,
} from '../components/amp/AmpCustomElement'

export const config = { amp: true }

const Home = props => (
  <>
    <Layout
      title="Welcome to AMP"
      description="Learn how to build an AMP First with Next.js."
    >
      <main>
        <h1 className="title">Welcome to AMP ⚡</h1>
        <p className="description">
          To get started, edit <code>pages/index.js</code> and save to reload.
        </p>

        <section className="hero">
          <a href="https://nextjs.org/learn/basics/getting-started">
            <h3>Getting Started &rarr;</h3>
            <p>Learn more about Next</p>
          </a>
          <a href="https://nextjs.org/docs#amp-support">
            <h3>AMP Support in Next.js &rarr;</h3>
            <p>Learn how to build AMP sites with Next.js</p>
          </a>
          <a href="https://amp.dev/documentation/components/?format=websites">
            <h3>AMP Components &rarr;</h3>
            <p>See which components are available.</p>
          </a>
        </section>

        <section>
          <h3>Using AMP Components</h3>
          <p>
            You can import AMP components using <code>next/head</code>. Checkout{' '}
            <code>components/amp/AmpCustomElement</code> for a simple way to
            import AMP components. Once the component is imported, you can use
            it like any other HTML element.
          </p>
          <AmpIncludeAmpCarousel />
          <amp-carousel
            type="slides"
            width="800"
            height="300"
            layout="responsive"
          >
            <amp-img
              src="https://unsplash.it/800/300?id=123"
              layout="fill"
              alt="demo image"
            />
            <amp-img
              src="https://unsplash.it/800/300?id=124"
              layout="fill"
              alt="demo image"
            />
            <amp-img
              src="https://unsplash.it/800/300?id=125"
              layout="fill"
              alt="demo image"
            />
          </amp-carousel>
        </section>

        <section>
          <h3>amp-bind & amp-state</h3>
          <p>
            It's no problem to use <code>amp-bind</code> and{' '}
            <code>amp-state</code> with Next.js. There are two things to be
            aware of:
            <ol>
              <li>
                The <code>[...]</code> binding syntax{' '}
                <code>[text]="myStateVariable"</code>is not supported in JSX.
                Use <code>data-amp-bind-text="myStateVariable"</code> instead.
              </li>
              <li>
                Initializing <code>amp-state</code> via JSON string is not
                supported in JSX:
                <pre>{`<amp-state id="myState">
  <script type="application/json">
    {
      "message": "Hello World"
    }
  </script>
</amp-state>`}</pre>
                Instead you need to use <code>dangerouslySetInnerHTML</code> to
                initialize the string. can use the{' '}
                <code>/components/amp/AmpState.js</code> component to see how it
                works. The same approach works for <code>amp-access</code> and{' '}
                <code>amp-consent</code> as well
              </li>
            </ol>
            Demo:
          </p>

          <AmpState id="myState">
            {{
              message: 'Hello World',
            }}
          </AmpState>
          <button
            on="tap:AMP.setState({
           greeting: myState.message
         })"
          >
            Click
          </button>
          <span data-amp-bind-text="greeting" />
        </section>

        <section>
          <h3>amp-list & amp-mustache</h3>
          <p>
            Mustache templates conflict with JSX and it's template literals need
            to be escaped. A simple approach is to escape them via back ticks:{' '}
            <code>src=&#123;`&#123;&#123;imageUrl&#125;&#125;`&#125;</code>.
          </p>

          <AmpIncludeAmpList />
          <amp-list
            src="https://amp.dev/documentation/examples/api/photo-stream"
            layout="fixed-height"
            height="64"
            binding="no"
          >
            <template type="amp-mustache">
              <amp-img
                src={`{{imageUrl}}`}
                width="64"
                height="64"
                alt="demo image"
              />
            </template>
          </amp-list>
        </section>

        <section>
          <h3>amp-script</h3>
          <p>
            Checkout the{' '}
            <a href="https://amp.dev/documentation/components/amp-script/">
              amp-script
            </a>{' '}
            helper here: <code>components/amp/AmpScript.js</code> for embedding
            custom JavaScript.
          </p>

          <AmpScript
            layout="container"
            src={`${props.host}/static/amp-script/hello.js`}
          >
            <button>Hello amp-script!</button>
          </AmpScript>

          <p>
            The helper also supports embedding inline scripts. Good to know:
            Next.js uses{' '}
            <a href="https://github.com/ampproject/amp-toolbox/tree/master/packages/optimizer">
              AMP Optimizer
            </a>{' '}
            under the hood, which automatically adds the needed script hashes
            for{' '}
            <a href="https://amp.dev/documentation/components/amp-script/#load-javascript-from-a-local-element">
              inline amp-scripts
            </a>
            .
          </p>
          <AmpScript
            id="hello-world"
            layout="fixed-height"
            height="64"
            script={() => {
              const btn = document.querySelector('button')
              btn.addEventListener('click', () => {
                document.body.textContent = 'Hello World!'
              })
            }}
          >
            <button>Hello amp-script!</button>
          </AmpScript>
        </section>
      </main>
    </Layout>
    <style jsx>{`
      code,
      pre {
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo,
          Courier, monospace;
        background: #f2f2f2;
        padding: 2px 3px;
        font-size: 13px;
      }
      main {
        margin: 0 auto;
        max-width: 800px;
      }
      main > * + * {
        margin: 4rem 0.5rem;
      }
      .title {
        text-align: center;
        padding-top: 4rem;
      }
      .hero {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        grid-gap: 1rem;
      }
      .hero > a {
        display: block;
        padding: 1rem;
        text-align: left;
        text-decoration: none;
        background-color: #005af0;
      }
      .hero h3 {
        margin: 0;
        color: #067df7;
        color: #fff;
      }
      .hero p {
        margin: 0;
        color: #fff;
      }
    `}</style>
  </>
)

// amp-script requires absolute URLs, so we create a property `host` which we can use to calculate the script URL.
Home.getInitialProps = async ({ req }) => {
  // WARNING: This is a generally unsafe application unless you're deploying to a managed platform like ZEIT Now.
  // Be sure your load balancer is configured to not allow spoofed host headers.
  return { host: `${getProtocol(req)}://${req.headers.host}` }
}

function getProtocol(req) {
  if (req.connection.encrypted) {
    return 'https'
  }
  const forwardedProto = req.headers['x-forwarded-proto']
  if (forwardedProto) {
    return forwardedProto.split(/\s*,\s*/)[0]
  }
  return 'http'
}

export default Home
