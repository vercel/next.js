import React, { useRef, useEffect } from 'react';
import LayoutNew from '../components/LayoutNew';
import Link from 'next/link';
import Slider from 'react-slick';
import { TweenMax, Power3 } from 'gsap';

import Wave from '../components/Wave';

function HomenewPage(props) {
  let featureWork = useRef(null);
  var settings = {
    dots: true,
    arrows: true,
    infinite: true,
    speed: 500,
    slidesToShow: 4,
    slidesToScroll: 1,
    responsive: [
      {
        breakpoint: 1200,
        settings: {
          slidesToShow: 3
        }
      },
      {
        breakpoint: 991,
        settings: {
          slidesToShow: 2
        }
      },
      {
        breakpoint: 480,
        settings: {
          slidesToShow: 1,
          dots: false
        }
      }
    ]
  };

  useEffect(() => {
    console.log(featureWork);
    TweenMax.to(featureWork, 0.4, {
      opacity: 1,
      y: -20,
      ease: Power3.easeIn
    });
  });

  return (
    <LayoutNew>
      <div className="home-banner text-white text-center">
        <div className="container">
          <div className="banner-text">
            <h1>
              A <strong className="font-900">Digital Atelier</strong> Creating
              Enticing & Compelling Online Ventures{' '}
            </h1>
            <p>
              We build great apps with Flutter, Firebase, React, Swift, React
              Native, NodeJs, VueJs, Android Development, IOS Development{' '}
            </p>
            <Link href="/about">
              <a href className="btn btn-outline-secondary mb-4">
                Contact Us
              </a>
            </Link>
          </div>
          <div className="bannerlogos-sec">
            <div className="row align-items-center">
              <div className="col-md-4">
                <h2 className="sub-heading font-24">
                  <span className="tech-border" /> Tech Solutions
                </h2>
              </div>
              <div className="col-md-8">
                <div className="bannerlogos">
                  <ul className="d-flex logo-list">
                    <li>
                      <img src="/static/media/logo-sketch.png" alt="img" />
                    </li>
                    <li>
                      <img src="/static/media/logo-figma.png" alt="img" />
                    </li>
                    <li>
                      <img src="/static/media/logo-studio.png" alt="img" />
                    </li>
                    <li>
                      <img src="/static/media/logo-framer.png" alt="img" />
                    </li>
                    <li>
                      <img src="/static/media/logo-react.png" alt="img" />
                    </li>
                    <li>
                      <img src="/static/media/logo-swift.png" alt="img" />
                    </li>
                    <li>
                      <img src="/static/media/logo-android.png" alt="img" />
                    </li>
                    <li>
                      <img src="/static/media/logo-ios.png" alt="img" />
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Wave />
      </div>
      <div className="home-portfolio-sec">
        <div className="container">
          <div className="row sec-paddingfull">
            <div className="col-xl-5 col-md-4">
              <h1
                ref={el => {
                  featureWork = el;
                }}
                className="widget-title tweenAnimation">
                Some of Our Featured Work
              </h1>
            </div>
            <div className="col-xl-7 col-md-8">
              <div className="text-col">
                Our dedicated team of experienced professionals will discuss
                with you all the valuable and useful information regarding the
                creation and development of an app. We will make you aware of
                the latest information in the preparation of the appropriate
                apps as per the needs and requirements of your customers.
              </div>
            </div>
          </div>
        </div>
        <div className="portfolio-slider">
          <Slider {...settings}>
            <div className="single-col">
              <div className="img-box">
                <a href="#" target="_blank">
                  <img
                    src="/static/media/gpcodersimages/portfolio-img1.jpg"
                    alt="img"
                  />
                  <span className="title-text postive-sol">
                    Positive Solutions International
                  </span>
                </a>
              </div>
            </div>
            <div className="single-col">
              <div className="img-box">
                <a href="#" target="_blank">
                  <img
                    src="/static/media/gpcodersimages/portfolio-img2.jpg"
                    alt="img"
                  />
                  <span className="title-text opus">Opusbehavioural</span>
                </a>
              </div>
            </div>
            <div className="single-col">
              <div className="img-box">
                <a href="#" target="_blank">
                  <img
                    src="/static/media/gpcodersimages/portfolio-img3.jpg"
                    alt="img"
                  />
                  <span className="title-text smartcurcumin">
                    Smartercurcumin{' '}
                  </span>
                </a>
              </div>
            </div>
            <div className="single-col">
              <div className="img-box">
                <a href="#" target="_blank">
                  <img
                    src="/static/media/gpcodersimages/portfolio-img4.jpg"
                    alt="img"
                  />
                  <span className="title-text weddingman">Weddingman</span>
                </a>
              </div>
            </div>
            <div className="single-col">
              <div className="img-box">
                <a href="#" target="_blank">
                  <img
                    src="/static/media/gpcodersimages/portfolio-img1.jpg"
                    alt="img"
                  />
                  <span className="title-text postive-sol">
                    Positive Solutions International
                  </span>
                </a>
              </div>
            </div>
            <div className="single-col">
              <div className="img-box">
                <a href="#" target="_blank">
                  <img
                    src="/static/media/gpcodersimages/portfolio-img2.jpg"
                    alt="img"
                  />
                  <span className="title-text opus">Opusbehavioural</span>
                </a>
              </div>
            </div>
          </Slider>
        </div>
        <div className="portfolio-cta-sec text-center">
          <div className="topsvg">
            {' '}
            <Wave />
          </div>
          <div className="container">
            <h2 className="sub-heading text-white mb-5">
              Ready to Catch up on Your Application Development?
            </h2>
            <p>
              <a href="#" className="btn btn-secondary">
                Let's start a project together
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="technology-sec position-relative text-white sec-paddingfull">
        <div className="container">
          <div className="row">
            <div className="col-md-6">
              <div className="position-relative ">
                <div className="iconbox">
                  <ul className="d-flex icon-list">
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/angular.png" />
                      <div className="text-box">Angular</div>
                    </li>
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/bootstrap.png" />
                      <div className="text-box">Bootstrap</div>
                    </li>
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/flutter.png" />
                      <div className="text-box">Flutter</div>
                    </li>
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/mongo.png" />
                      <div className="text-box">MongoDB</div>
                    </li>
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/mysql.png" />
                      <div className="text-box">MySQL</div>
                    </li>
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/node.png" />
                      <div className="text-box">Node JS</div>
                    </li>
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/php.png" />
                      <div className="text-box">PHP</div>
                    </li>
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/react.png" />
                      <div className="text-box">React</div>
                    </li>
                    <li>
                      <img
                        src="/static/media/gpcodersimages/technology-logos/Sass.png"
                        alt="sass"
                      />
                      <div className="text-box">Sass</div>
                    </li>
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/swift.png" />
                      <div className="text-box">Swift</div>
                    </li>
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/vuejs.png" />
                      <div className="text-box">VueJs</div>
                    </li>
                    <li>
                      <img src="/static/media/gpcodersimages/technology-logos/laravel.png" />
                      <div className="text-box">Laravel</div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="textcol">
                <h1 className="widget-title">
                  <span className="font-300">We work on</span>
                  <br />
                  Major Technologies
                </h1>
                <p>We provide both back-end and front-end development.</p>
                <p>
                  <a href="#" className="btn btn-white mb-3 mr-3">
                    View all
                  </a>
                  <a href="#" className="btn btn-outline-secondary mb-3">
                    Hire Us{' '}
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
        <Wave />
      </div>
      <div className="custom-sol-sec sec-paddingfull">
        <div className="container">
          <div className="text-center max-width86">
            <h1 className="widget-title">
              Our Process - How We Develop A Custom Solution?
            </h1>
            <p className="font-24">
              We work in collaboration to develop a custom solution that fits
              your business requirements. Here’s how we work:
            </p>
          </div>
          <div className="row pt-5 pb-5 align-items-center">
            <div className="col-md-6">
              <div className="imgbox">
                <img src="/static/media/sample-img.jpg" />
              </div>
            </div>
            <div className="col-md-6">
              <div className="textbox">
                <h2 className="sub-heading font-900">Web Development</h2>
                <p>
                  Lorem Ipsum is simply dummy text of the printing and
                  typesetting industry. Lorem Ipsum has been the industry's
                  standard dummy text ever since the 1500s, when an unknown
                  printer took a galley of{' '}
                </p>
              </div>
            </div>
          </div>
          <div className="row pt-5 pb-5 flex-row-reverse  align-items-center">
            <div className="col-md-6">
              <div className="imgbox">
                <img src="/static/media/sample-img.jpg" />
              </div>
            </div>
            <div className="col-md-6">
              <div className="textbox">
                <h2 className="sub-heading font-900">Web Development</h2>
                <p>
                  Lorem Ipsum is simply dummy text of the printing and
                  typesetting industry. Lorem Ipsum has been the industry's
                  standard dummy text ever since the 1500s, when an unknown
                  printer took a galley of{' '}
                </p>
              </div>
            </div>
          </div>
          <div className="row pt-5 pb-5 align-items-center">
            <div className="col-md-6">
              <div className="imgbox">
                <img src="/static/media/sample-img.jpg" />
              </div>
            </div>
            <div className="col-md-6">
              <div className="textbox">
                <h2 className="sub-heading font-900">Web Development</h2>
                <p>
                  Lorem Ipsum is simply dummy text of the printing and
                  typesetting industry. Lorem Ipsum has been the industry's
                  standard dummy text ever since the 1500s, when an unknown
                  printer took a galley of{' '}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="quality-sec">
        <div className="container">
          <div className="process-box text-center ">
            <h3 className="small-tag text-white mb-3">PROCESS</h3>
            <h1 className="widget-title font-300 text-white">
              We Focus on <strong className="font-900">Quality</strong>
              That Keeps Customer Coming back
            </h1>
            <p>
              <a className="btn btn-white" href="#">
                How we work?
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="why-us sec-paddingfull pt-0">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-md-6">
              <h1 className="widget-title font-300">
                <strong className="font-900">Gpcoders</strong> is the right
                technology partner
              </h1>
              <p>
                <a href="#" className="btn btn-secondary">
                  About Us
                </a>
              </p>
            </div>
            <div className="col-md-6">
              <div className="whyus-col">
                <ul className="d-flex text-center">
                  <li>
                    <div className="singlecol">
                      <img src="/static/media/gpcodersimages/client-icon.png" />
                      <p>Connected with Clients</p>
                    </div>
                  </li>
                  <li>
                    <div className="singlecol">
                      <img src="/static/media/gpcodersimages/quality-icon.png" />
                      <p>Quality Focused Work</p>
                    </div>
                  </li>
                  <li>
                    <div className="singlecol">
                      <img src="/static/media/gpcodersimages/ux-icon.png" />
                      <p>Expertise in Design & User experience</p>
                    </div>
                  </li>
                  <li>
                    <div className="singlecol">
                      <img src="/static/media/gpcodersimages/team-icon.png" />
                      <p>Talented and Experienced Team</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LayoutNew>
  );
}

export default HomenewPage;
