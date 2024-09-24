import Script from 'next/script'

export default () => {
  return (
    <div>
      Hello
      <Script id="custom-mark">{"performance.mark('custom-mark')"}</Script>
    </div>
  )
}
