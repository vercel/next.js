import Head from 'next/head'

export default function Home() {
  return (
    <div className='min-h-screen py-2 flex flex-col justify-center items-center'>
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className='px-20 flex-1 flex flex-col justify-center items-center text-center'>
        <h1 className='text-6xl font-bold'>
          Welcome to <a className='text-blue-600' href="https://nextjs.org">Next.js!</a>
        </h1>

        <p className='text-2xl mt-3'>
          Get started by editing{' '}
          <code className='bg-gray-100 rounded-md p-3 text-lg font-mono'>pages/index.js</code>
        </p>

        <div className='flex items-center justify-around flex-wrap mt-6 max-w-4xl sm:w-full'>
          <a href="https://nextjs.org/docs" className='w-96 mt-6 p-6 text-left border rounded-xl hover:text-blue-600 focus:text-blue-600'>
            <h3 className='text-2xl font-bold'>Documentation &rarr;</h3>
            <p className='mt-4 text-xl'>Find in-depth information about Next.js features and API.</p>
          </a>

          <a href="https://nextjs.org/learn" className='w-96 mt-6 p-6 text-left border rounded-xl hover:text-blue-600 focus:text-blue-600'>
            <h3 className='text-2xl font-bold'>Learn &rarr;</h3>
            <p className='mt-4 text-xl'>Learn about Next.js in an interactive course with quizzes!</p>
          </a>

          <a
            href="https://github.com/vercel/next.js/tree/master/examples"
            className='w-96 mt-6 p-6 text-left border rounded-xl hover:text-blue-600 focus:text-blue-600'
          >
            <h3 className='text-2xl font-bold'>Examples &rarr;</h3>
            <p className='mt-4 text-xl'>Discover and deploy boilerplate example Next.js projects.</p>
          </a>

          <a
            href="https://vercel.com/import?filter=next.js&utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className='w-96 mt-6 p-6 text-left border rounded-xl hover:text-blue-600 focus:text-blue-600'
          >
            <h3 className='text-2xl font-bold'>Deploy &rarr;</h3>
            <p className='mt-4 text-xl'>
              Instantly deploy your Next.js site to a public URL with Vercel.
            </p>
          </a>
        </div>
      </main>

      <footer className='w-full h-24 border-t flex justify-center items-center'>
        <a
          className='flex justify-center items-center'
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <img src="/vercel.svg" alt="Vercel Logo" className='h-4 ml-2' />
        </a>
      </footer>
    </div>
  )
}
