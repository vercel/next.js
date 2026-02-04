import Script from 'next/script'

export default function MultiplePage() {
  return (
    <div>
      <h1>Multiple beforeInteractive Scripts Test</h1>
      <Script
        id="first-script"
        strategy="beforeInteractive"
        className="first-script"
        dangerouslySetInnerHTML={{
          __html: `
            console.log('First beforeInteractive script executed');
            window.firstScriptExecuted = true;
          `,
        }}
      />
      <Script
        id="second-script"
        strategy="beforeInteractive"
        className="second-script"
        dangerouslySetInnerHTML={{
          __html: `
            console.log('Second beforeInteractive script executed');
            window.secondScriptExecuted = true;
          `,
        }}
      />
      <p>
        This page tests multiple beforeInteractive scripts with CSS classes.
      </p>
    </div>
  )
}
