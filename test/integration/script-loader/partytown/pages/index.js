import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <div>Home Page</div>
      <Script
        src="https://cdn.jsdelivr.net/npm/cookieconsent@3/build/cookieconsent.min.js"
        strategy="worker"
      />
    </div>
  )
}

export default Page
