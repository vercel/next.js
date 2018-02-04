import App from "../components/app"

export default () => (
<App>
  <div>
      <div className="row card" id="references">
        <h1>References</h1>
        <ul>
          <li><a href="https://codeburst.io/next-js-on-cloud-functions-for-firebase-with-firebase-hosting-7911465298f2">Next.js on Cloud Functions for Firebase with Firebase Hosting</a></li>
          <li><a href="https://www.youtube.com/watch?v=82tZAPMHfT4">Server-side Rendering React from Scratch with Firebase Hosting</a></li>
          <li><a href="https://github.com/firebase/functions-samples/tree/master/nextjs-with-firebase-hosting">Next.js with Firebase Hosting Rewrites</a></li>
        </ul>
      </div>

      <style jsx>{`
        .row {
          max-width: 880px;
          margin: 80px auto 40px;
          display: flex;
          flex-direction: row;
          justify-content: space-around;
        }
        .card {
          padding: 18px 18px 24px;
          width: 600px;
          text-align: left;
          text-decoration: none;
          color: #434343;
          border: 1px solid #9B9B9B;
        }
        .card:hover {
          border-color: #067df7;
        }
        li {
          padding: 20px;
        }
      `}</style>
    </div>
  </App>
)
