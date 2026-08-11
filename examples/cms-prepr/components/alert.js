import Container from './container'

export default function Alert({ preview }) {
  return (
    <div
      className={
        preview
          ? 'border-b border-primary-700 bg-primary-600 text-white'
          : 'border-b border-secondary-300 bg-secondary-100'
      }
    >
      <Container>
        <div className="py-2 text-center text-sm">
          {preview ? (
            <>
              This is page is a preview.{' '}
              <a
                href="/api/exit-preview"
                className="underline transition-colors hover:text-primary-100"
              >
                Click here
              </a>{' '}
              to exit preview mode.
            </>
          ) : (
            <>
              The source code for this blog is{' '}
              <a
                href="https://github.com/preprio/next.js-blog-example"
                className="text-primary-600 underline transition-colors hover:text-primary-700"
              >
                available on GitHub
              </a>
              .
            </>
          )}
        </div>
      </Container>
    </div>
  )
}
