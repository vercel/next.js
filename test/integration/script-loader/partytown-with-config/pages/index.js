import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <Script
        src="https://cdn.jsdelivr.net/npm/cookieconsent@3/build/cookieconsent.min.js"
        strategy="worker"
      />
      <div>Home Page</div>
    </div>
  )
}

export default Page
