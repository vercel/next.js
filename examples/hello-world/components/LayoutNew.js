import Head from 'next/head';
import GpcodersNav from './navigation/Navigation';
import Footer from './footer/Footer';
const LayoutNew = props => {
  return (
    <div>
      <Head>
        <title>GPCODERS</title>
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
        <link
          rel="stylesheet"
          href="https://use.fontawesome.com/releases/v5.8.2/css/all.css"
          integrity="sha384-oS3vJWv+0UjzBfQzYUhtDYW+Pj2yciDJxpsK1OYPAYjqT085Qq/1cq5FLXAZQ7Ay"
          crossorigin="crossOrigin"
        />
        <link
          rel="stylesheet"
          href="https://maxcdn.bootstrapcdn.com/bootstrap/4.4.1/css/bootstrap.min.css"
        />
      </Head>
      <GpcodersNav />
      {props.children}
      <Footer />
    </div>
  );
};

export default LayoutNew;
