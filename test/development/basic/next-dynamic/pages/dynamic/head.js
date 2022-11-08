import dynamic from 'next/dynamic'
import Head from 'next/head'

const Test = dynamic({
  loader: async () => {
    // component module
    return {
      default: () => {
        return (
          <div className="dynamic-style">
            <Head>
              <style
                dangerouslySetInnerHTML={{
                  __html: `
              .dynamic-style {
                background-color: green;
                height: 200px;
              }
            `,
                }}
              />
            </Head>
            test
          </div>
        )
      },
    }
  },
  ssr: false,
})

export default Test
