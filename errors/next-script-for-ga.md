# Next Script for Google Analytics

### Why This Error Occurred

An inline script was used for Google analytics which might impact your webpage's performance.

### Possible Ways to Fix It

#### Script component

Use the Script component with the right loading strategy to defer loading of the script until necessary.

```jsx
import Script from 'next/script'

const Home = () => {
  return (
    <div class="container">
      <Script>
        {`
          (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
              (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
              m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
              })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');
              
              ga('create', 'UA-XXXXX-Y', 'auto');
              ga('send', 'pageview');
          })
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
      <Script>
        {`
          window.ga=window.ga||function(){(ga.q=ga.q||[]).push(arguments)};ga.l=+new Date;
          ga('create', 'UA-XXXXX-Y', 'auto');
          ga('send', 'pageview');
          })
        `}
      </Script>
      <Script
        src="https://www.google-analytics.com/analytics.js"
        strategy="lazyOnload"
      ></Script>
    </div>
  )
}

export default Home
```

### Useful Links

- [Add analytics.js to Your Site](https://developers.google.com/analytics/devguides/collection/analyticsjs)
- [Efficiently load third-party JavaScript](https://web.dev/efficiently-load-third-party-javascript/)
