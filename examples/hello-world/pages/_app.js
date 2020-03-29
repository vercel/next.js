import { Fragment } from 'react';
import NextNProgress from '../components/progress/NextProgress';
import '../styles.css';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import 'antd/dist/antd.css';
import '../styles/app.css';
import '../styles/home.css';
import '../styles/javascript.css';
import '../styles/services.css';
import '../styles/gpcoders_nav.css';
import '../styles/Card.css';
import '../styles/footer.css';
import '../styles/FooterPage.css';

export default function MyApp({ Component, pageProps }) {
  return (
    <Fragment>
      <NextNProgress />
      <Component {...pageProps} />
    </Fragment>
  );
}
