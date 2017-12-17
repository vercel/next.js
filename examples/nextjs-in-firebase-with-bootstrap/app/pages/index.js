import Link from 'next/link'
import App from "../components/app"

export default () => (
<App>
  <div>
    <div>
    <div className="row" id="start">
      <h1 className="title">Next.js on Cloud Functions for Firebase with Firebase Hosting!</h1>
    </div>

      <div className="row card">
        <h1>Getting Started</h1>
       <ul>
         <li>git clone https://github.com/ananddayalan/nextjs-in-firebase-with-bootstrap</li>
         <li>cd nextjs-in-firebase-with-bootstrap</li>
         <li>yarn install</li>
       </ul>
      </div>

      <div className="row card" id="use">
        <h1>How to use?</h1>
        <ul>
          <li><h2>Run Next.js development<pre>yarn next</pre></h2></li>
          <li><h2>Run Firebase locally for testing<pre>yarn serve</pre></h2></li>
          <li><h2>Deploy it to the cloud with Firebase<pre>yarn deploy</pre></h2></li>
        </ul>
      </div>

      <div className="row card" id="refs">
        <Link href="/references">
          <a>Click Here to see the References</a>
        </Link>
      </div>

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
      .title {
        padding: 30px;
      }
    `}</style>
  </div>
  </App>
)
