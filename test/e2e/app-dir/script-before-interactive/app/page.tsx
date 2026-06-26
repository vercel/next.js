import Script from 'next/script'

export default function Page() {
  return (
    <div>
      <h1>Script beforeInteractive Test</h1>
      <Script
        id="example-script"
        strategy="beforeInteractive"
        className="example-class"
        dangerouslySetInnerHTML={{
          __html: `
            console.log('beforeInteractive script executed');
            window.beforeInteractiveExecuted = true;
          `,
        }}
      />
      <p>
        This page tests the beforeInteractive script strategy with CSS classes.
      </p>
    </div>
  )
}
