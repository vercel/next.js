# Next Script for Google Analytics

### Why This Error Occurred

An inline script was used for Google analytics which might impact your webpage's performance.

### Possible Ways to Fix It

#### Using gtag.js

If you are using the [gtag.js](https://developers.google.com/analytics/devguides/collection/gtagjs) script to add analytics, use the `next/script` component with the right loading strategy to defer loading of the script until necessary.

```jsx
import Script from 'next/script'

const Home = () => {
  return (
    <div class="container">
      <!-- Global site tag (gtag.js) - Google Analytics -->
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"
        strategy="lazyOnload"
      />
      <Script id="google-analytics">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'GA_MEASUREMENT_ID');
        `}
      </Script>
    </div>
  )
}

export default Home
```

#### Using analytics.js

If you are using the [analytics.js](https://developers.google.com/analytics/devguides/collection/analyticsjs) script to add analytics:

```jsx
import Script from 'next/script'

const Home = () => {
  return (
    <div class="container">
      <Script id="google-analytics">
        {`
          (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
          (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
          m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
          })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

          ga('create', 'UA-XXXXX-Y', 'auto');
          ga('send', 'pageview');
        `}
      </Script>
    </div>
  )
}

export default Home
```

If you are using the [alternative async variant](https://developers.google.com/analytics/devguides/collection/analyticsjs#alternative_async_tag):

```jsx
import Script from 'next/script'

const Home = () => {
  return (
    <div class="container">
      <Script id="google-analytics">
        {`
          window.ga=window.ga||function(){(ga.q=ga.q||[]).push(arguments)};ga.l=+new Date;
          ga('create', 'GOOGLE_ANALYTICS_ID', 'auto');
          ga('send', 'pageview');
        `}
      </Script>
      <Script
        src="https://www.google-analytics.com/analytics.js"
        strategy="lazyOnload"
      />
    </div>
  )
}

export default Home
```

### Useful Links

- [Add analytics.js to Your Site](https://developers.google.com/analytics/devguides/collection/analyticsjs)
- [Efficiently load third-party JavaScript](https://web.dev/efficiently-load-third-party-javascript/)
- [next/script Documentation](https://nextjs.org/docs/basic-features/script)
