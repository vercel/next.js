import type { AppProps } from 'next/app'
import Script from 'next/script'

const FACEBOOK_PAGE_ID = process.env.NEXT_PUBLIC_FACEBOOK_PAGE_ID
const ATTRIBUTION = ''

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      {/* Facebook Chat Plugin*/}
      <div id="fb-root"></div>
      <div id="fb-customer-chat" className="fb-customerchat"></div>
      <Script
        id="fb-chat"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
          var chatbox = document.getElementById('fb-customer-chat');
          chatbox.setAttribute("page_id", "${FACEBOOK_PAGE_ID}");
          chatbox.setAttribute("attribution", "${ATTRIBUTION}");
          window.fbAsyncInit = function() {
            FB.init({
              xfbml            : true,
              version          : 'v13.0'
            });
          };
      
          (function(d, s, id) {
            var js, fjs = d.getElementsByTagName(s)[0];
            if (d.getElementById(id)) return;
            js = d.createElement(s); js.id = id;
            js.src = 'https://connect.facebook.net/en_US/sdk/xfbml.customerchat.js';
            fjs.parentNode.insertBefore(js, fjs);
          }(document, 'script', 'facebook-jssdk'));
          `,
        }}
      />
    </>
  )
}

export default MyApp
