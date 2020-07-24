import Head from 'next/head'

export default function AmpIncludeCustomElement(props) {
  return (
    <Head>
      <script
        async
        custom-element={props.name}
        src={
          'https://cdn.ampproject.org/v0/' +
          props.name +
          '-' +
          props.version +
          '.js'
        }
        key={props.name}
      />
    </Head>
  )
}
