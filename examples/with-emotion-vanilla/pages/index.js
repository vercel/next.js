import Head from "next/head";
import {
  basicStyles,
  otherStyles,
  someMoreBasicStyles,
  someCssAsObject,
  combinedAsArray,
  cxExample,
  keyframesExample,
} from "../shared/styles";

const Home = () => (
  <>
    <Head>
      <title>Emotion using the vanilla version supporting SSR</title>
    </Head>
    <div>
      <h1>Emotion Vanilla example</h1>
      <div className={basicStyles}>Basic styles using emotion</div>
      <div className={otherStyles}>Some more styles using emotion</div>
      <div className={someMoreBasicStyles}>Well why not here is some more</div>
      <div className={someCssAsObject}>Object styles using emotion css</div>
      <div className={combinedAsArray}>Array of styles using emotion css</div>
      <div className={cxExample}>cx example from emotion</div>
      <div className={keyframesExample} />
    </div>
  </>
);

export default Home;
