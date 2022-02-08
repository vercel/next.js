import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js"
        strategy="worker"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/cookieconsent@3/build/cookieconsent.min.js"
        strategy="worker"
      />
      <div>Page 1</div>
    </div>
  )
}

export default Page
