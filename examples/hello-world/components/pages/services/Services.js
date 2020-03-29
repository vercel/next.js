import LayoutPage from '../../LayoutPage';
import Wave from '../../Wave';
function ServicesPage(props) {
  return (
    <LayoutPage>
      <div className="page-banner service-banner">
        <div className="container">
          <div className="pagebanner-text text-white">
            <h1>
              <strong className="font-900">Services</strong> we offer
            </h1>
            <p>
              Lorem Ipsum is simply dummy text of the printing lorem Ipsum is
              simply dummy and typesetting industry.{' '}
            </p>
            <p>
              <a href className="btn btn-outline-secondary">
                Contact Us
              </a>
            </p>
          </div>
        </div>
        <Wave />
      </div>
      <div className="service-row sec-paddingfull">
        <div className="container">
          <div className="row">
            <div className="col-lg-7">
              <div className="text-col">
                <h3 className="sub-heading font-900">UI/UX Design</h3>
                <p>
                  Our UI or UX team makes every effort to prepare a stunning web
                  application along with high-end interaction capability. Our
                  specialists perform every action with complete concentration
                  on the needs and requirements of the end-customers.
                </p>
                <ul className="service-list">
                  <li>Idea and Research</li>
                  <li>Prototyping</li>
                  <li>Wireframing</li>
                  <li>Complete Design</li>
                  <li>Product Improvements</li>
                  <li>Visual Design</li>
                  <li>Website and App UI/UX</li>
                </ul>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="img-col mb-5">
                <img
                  src="/static/media/gpcodersimages/design-img.png"
                  alt="img"
                />
              </div>
            </div>
          </div>
          <div className="projs-sec pt-3">
            <h3 className="sub-heading d-none">Design Tools</h3>
            <ul className="d-flex text-center mb-5">
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/ai.svg"
                    alt="img"
                  />
                </div>
                <p>Illustrator</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/zeplin.svg"
                    alt="img"
                  />
                </div>
                <p>Zeplin</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/photoshop.svg"
                    alt="img"
                  />
                </div>
                <p>Photoshop</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/xd.png"
                    alt="img"
                  />
                </div>
                <p>Adobe Xd</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/figma.png"
                    alt="img"
                  />
                </div>
                <p>Figma</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/sketch.svg"
                    alt="img"
                  />
                </div>
                <p>Sketch.</p>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="service-row sec-paddingbottom">
        <div className="container">
          <div className="row flex-row-reverse">
            <div className="col-lg-7">
              <div className="text-col">
                <h3 className="sub-heading font-900">Web Development</h3>
                <p>
                  GP Coders offer services in custom web app development like
                  layout & design, user-friendliness, presentation, source code,
                  and many more as per the objective of our customers. The
                  services which our team provide consists of the following -
                </p>
                <ul className="service-list">
                  <li>Laravel</li>
                  <li>Codeignitor</li>
                  <li>Angular</li>
                  <li>Wordpress</li>
                  <li>React</li>
                  <li>Node</li>
                  <li>Shopify</li>
                  <li>Magento</li>
                </ul>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="img-col">
                <img
                  src="/static/media/gpcodersimages/development-img.png"
                  alt="img"
                />
              </div>
            </div>
          </div>
          <div className="projs-sec text-center pt-4">
            <ul className="d-flex mb-5">
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/vuejs.png"
                    alt="img"
                  />
                </div>
                <p>Vue Js</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/wordpress.png"
                    alt="img"
                  />
                </div>
                <p>Wordpress</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/sass.png"
                    alt="img"
                  />
                </div>
                <p>Sass</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/laravel.png"
                    alt="img"
                  />
                </div>
                <p>Laravel</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/react.png"
                    alt="img"
                  />
                </div>
                <p>React</p>
              </li>

              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/angular.png"
                    alt="img"
                  />
                </div>
                <p>Angular</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/nodejs.png"
                    alt="img"
                  />
                </div>
                <p>Node Js</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/bootstrap.png"
                    alt="img"
                  />
                </div>
                <p>Bootstrap</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/shopify.png"
                    alt="img"
                  />
                </div>
                <p>Shopify</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/magento.png"
                    alt="img"
                  />
                </div>
                <p>Magento</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/html-5.svg"
                    alt="img"
                  />
                </div>
                <p>HTML</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/css.svg"
                    alt="img"
                  />
                </div>
                <p>CSS</p>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="service-row sec-paddingbottom">
        <div className="container">
          <div className="row">
            <div className="col-lg-7">
              <div className="text-col">
                <h3 className="sub-heading font-900">Mobile App Development</h3>
                <p>
                  Our dedicated team of experienced professionals will discuss
                  with you all the valuable and useful information regarding the
                  creation and development of an app. We will make you aware of
                  the latest information in the preparation of the appropriate
                  apps as per the requirements of your customers.
                </p>
                <ul className="service-list">
                  <li>iOS App Development</li>
                  <li>Android App Development</li>
                  <li>Native Apps</li>
                  <li>Web Apps</li>
                  <li>Hyprid Apps</li>
                </ul>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="img-col mb-5">
                <img
                  src="/static/media/gpcodersimages/mobileapp-img.png"
                  alt="img"
                />
              </div>
            </div>
          </div>
          <div className="projs-sec pt-3">
            <h3 className="sub-heading d-none">Design Tools</h3>
            <ul className="d-flex text-center mb-0">
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/react.png"
                    alt="img"
                  />
                </div>
                <p>React Native</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/flutter.png"
                    alt="img"
                  />
                </div>
                <p>Flutter</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/swift.png"
                    alt="img"
                  />
                </div>
                <p>Swift</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/kotlin.png"
                    alt="img"
                  />
                </div>
                <p>Kotlin</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/ios.png"
                    alt="img"
                  />
                </div>
                <p>Ios</p>
              </li>
              <li>
                <div className="circle-box">
                  <img
                    src="/static/media/gpcodersimages/service-icon/android.png"
                    alt="img"
                  />
                </div>
                <p>Android</p>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </LayoutPage>
  );
}

export default ServicesPage;
