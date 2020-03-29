import { Tabs } from 'antd';
import LayoutPage from '../../LayoutPage';
import Wave from '../../Wave';
const { TabPane } = Tabs;

function callback(key) {
  console.log(key);
}

function JavascriptPage(props) {
  return (
    <LayoutPage>
      <div className="page-banner javascript-banner">
        <div className="container">
          <div className="pagebanner-text text-white">
            <h1>
              <strong className="font-900">Javascript</strong> Framworks and
              Libraries
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
      <div className="whyjs-sec text-center sec-padding">
        <div className="container">
          <div className="text-center max-width86 pb-5">
            <h1 class="widget-title">
              Lorem Ipsum is simply dummy text of the printing
            </h1>
            <p class="font-24">
              Lorem Ipsum is simply dummy text of the printing and typesetting
              industry. Lorem Ipsum has been the industry's standard dummy text
              ever since the 1500s, when an unknown printer took a galley of.
              Lorem Ipsum is simply dummy text of the printing and typesetting
              industry. Lorem Ipsum has been the industry's
            </p>
          </div>
          <div className="whyus-col list-col4">
            <ul className="d-flex text-center">
              <li>
                <div className="singlecol">
                  <img
                    src="/static/media/gpcodersimages/faster.svg"
                    alt="img"
                  />
                  <p>Fast for end user</p>
                </div>
              </li>
              <li>
                <div className="singlecol">
                  <img
                    src="/static/media/gpcodersimages/secure.svg"
                    alt="img"
                  />
                  <p>Highly Secure</p>
                </div>
              </li>
              <li>
                <div className="singlecol">
                  <img
                    src="/static/media/gpcodersimages/easy-learn.svg"
                    alt="img"
                  />
                  <p>Easy to learn</p>
                </div>
              </li>
              <li>
                <div className="singlecol">
                  <img
                    src="/static/media/gpcodersimages/debug-test.svg"
                    alt="img"
                  />
                  <p>Easy to debug and test</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="jstab-sec ">
        <div className="jstabtop-box text-center text-white">
          <div className="container">
            <h1 className="widget-title">
              Our Expertise in Vanilla JS Development{' '}
            </h1>
            <p className="font-24">
              Lorem Ipsum is simply dummy text of the printing and typesetting
              industry. Lorem Ipsum has been the industry's standard dummy text
              ever since the 1500s, when an unknown printer. Lorem Ipsum has
              been the industry's standard dummy text{' '}
            </p>
          </div>
          <Wave />
        </div>
        <div className="container">
          <Tabs defaultActiveKey="1" onChange={callback}>
            <TabPane tab="Vanilla Js" key="1">
              <div className="text-white introbox vanillaintro">
                <div className="row align-items-center">
                  <div className="col-lg-3 col-md-4">
                    <div className="imgbox">
                      <img
                        src="/static/media/gpcodersimages/vanilla.png"
                        alt="img"
                      />
                    </div>
                  </div>
                  <div className="col-lg-9 col-md-8">
                    <div className="textbox">
                      <h3 class="sub-heading font-900 text-uppercase">
                        Vanilla Js
                      </h3>
                      <p>
                        Vanilla JS is a fast, lightweight, cross-platform
                        framework. for building incredible, powerful JavaScript
                        applications. Vanilla JS is a fast, lightweight,
                        cross-platform framework. for building incredible,
                        powerful JavaScript applications.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="projs-sec text-center">
                <ul className="d-flex">
                  <li>
                    <div className="circle-box">
                      <img
                        src="/static/media/gpcodersimages/framework.svg"
                        alt="img"
                      />
                    </div>
                    <p>cross-platform framework</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img
                        src="/static/media/gpcodersimages/lightweight.svg"
                        alt="img"
                      />
                    </div>
                    <p>Lightweight</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img
                        src="/static/media/gpcodersimages/easy-learn.svg"
                        alt="img"
                      />
                    </div>
                    <p>Easy to use</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img
                        src="/static/media/gpcodersimages/fast-performance.svg"
                        alt="img"
                      />
                    </div>
                    <p>Fast Performance</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img
                        src="/static/media/gpcodersimages/debug-test.svg"
                        alt="img"
                      />
                    </div>
                    <p>Easy to debug</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img
                        src="/static/media/gpcodersimages/web-performance.svg"
                        alt="img"
                      />
                    </div>
                    <p>Better web performance.</p>
                  </li>
                </ul>
              </div>
              <div className="tabcompany-sec">
                <div className="text-center max-width86 pb-5">
                  <h1 class="widget-title">Companies using Vanilla Js</h1>
                  <p class="font-24">
                    Lorem Ipsum is simply dummy text of the printing and
                    typesetting industry. Lorem Ipsum has been the industry's
                    standard dummy text ever since the 1500s, when an unknown
                    printer took a galley of. Lorem Ipsum is simply dummy text
                    of the printing and typesetting industry. Lorem Ipsum has
                    been the industry's
                  </p>
                </div>
                <div className="row">
                  <div className="col-md-4">
                    <div className="single-col">
                      <div className="box-content">
                        <h3 className="sub-heading font-900">Netflix</h3>
                        <p>
                          Netflix still uses React for server-side templating,
                          but switched to vanilla JS for the client-side code
                          and saw big performance improvements.
                        </p>
                      </div>
                      <div className="imgbox">
                        <img src="/static/media/gpcodersimages/netflix-img.jpg" />
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="single-col">
                      <div className="box-content">
                        <h3 className="sub-heading font-900">GitHub</h3>
                        <p>
                          GitHub removed jQuery from their frontend at the end
                          of 2018 in favor of vanilla JS, polyfills, and native
                          web components.
                        </p>
                      </div>
                      <div className="imgbox">
                        <img src="/static/media/gpcodersimages/github-img.jpg" />
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="single-col">
                      <div className="box-content">
                        <h3 className="sub-heading font-900">Mark & Spencer</h3>
                        <p>
                          The ecommerce shopping website for British retailer
                          Mark & Spencer is also build using vanilla JS.
                        </p>
                      </div>
                      <div className="imgbox">
                        <img src="/static/media/gpcodersimages/markspen-img.jpg" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabPane>
            <TabPane tab="Angular Js" key="2">
              <div className="text-white angularintro introbox">
                <div className="row align-items-center">
                  <div className="col-lg-3 col-md-4">
                    <div className="imgbox">
                      <img src="/static/media/gpcodersimages/angular-logo.png" />
                    </div>
                  </div>
                  <div className="col-lg-9 col-md-8">
                    <div className="textbox">
                      <h3 class="sub-heading font-900 text-uppercase">
                        Angular Js
                      </h3>
                      <p>
                        Vanilla JS is a fast, lightweight, cross-platform
                        framework. for building incredible, powerful JavaScript
                        applications. Vanilla JS is a fast, lightweight,
                        cross-platform framework. for building incredible,
                        powerful JavaScript applications.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="projs-sec text-center">
                <ul className="d-flex">
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/framework.svg" />
                    </div>
                    <p>cross-platform framework</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/lightweight.svg" />
                    </div>
                    <p>Lightweight</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/easy-learn.svg" />
                    </div>
                    <p>Easy to use</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/fast-performance.svg" />
                    </div>
                    <p>Fast Performance</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/debug-test.svg" />
                    </div>
                    <p>Easy to debug</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/web-performance.svg" />
                    </div>
                    <p>Better web performance.</p>
                  </li>
                </ul>
              </div>
            </TabPane>
            <TabPane tab="React Js" key="3">
              <div className="introbox  reactintro">
                <div className="row align-items-center">
                  <div className="col-lg-3 col-md-4">
                    <div className="imgbox">
                      <img src="/static/media/gpcodersimages/react-logo.png" />
                    </div>
                  </div>
                  <div className="col-lg-9 col-md-8">
                    <div className="textbox">
                      <h3 class="sub-heading font-900 text-uppercase">
                        React Js
                      </h3>
                      <p>
                        Vanilla JS is a fast, lightweight, cross-platform
                        framework. for building incredible, powerful JavaScript
                        applications. Vanilla JS is a fast, lightweight,
                        cross-platform framework. for building incredible,
                        powerful JavaScript applications.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="projs-sec text-center">
                <ul className="d-flex">
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/framework.svg" />
                    </div>
                    <p>cross-platform framework</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/lightweight.svg" />
                    </div>
                    <p>Lightweight</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/easy-learn.svg" />
                    </div>
                    <p>Easy to use</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/fast-performance.svg" />
                    </div>
                    <p>Fast Performance</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/debug-test.svg" />
                    </div>
                    <p>Easy to debug</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/web-performance.svg" />
                    </div>
                    <p>Better web performance.</p>
                  </li>
                </ul>
              </div>
            </TabPane>
            <TabPane tab="Vue Js" key="4">
              <div className="vueintro introbox">
                <div className="row align-items-center">
                  <div className="col-lg-3 col-md-4">
                    <div className="imgbox">
                      <img src="/static/media/gpcodersimages/vuejs-logo.png" />
                    </div>
                  </div>
                  <div className="col-lg-9 col-md-8">
                    <div className="textbox">
                      <h3 class="sub-heading font-900 text-uppercase">
                        Vue Js
                      </h3>
                      <p>
                        Vanilla JS is a fast, lightweight, cross-platform
                        framework. for building incredible, powerful JavaScript
                        applications. Vanilla JS is a fast, lightweight,
                        cross-platform framework. for building incredible,
                        powerful JavaScript applications.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="projs-sec text-center">
                <ul className="d-flex">
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/framework.svg" />
                    </div>
                    <p>cross-platform framework</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/lightweight.svg" />
                    </div>
                    <p>Lightweight</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/easy-learn.svg" />
                    </div>
                    <p>Easy to use</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/fast-performance.svg" />
                    </div>
                    <p>Fast Performance</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/debug-test.svg" />
                    </div>
                    <p>Easy to debug</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/web-performance.svg" />
                    </div>
                    <p>Better web performance.</p>
                  </li>
                </ul>
              </div>
            </TabPane>
            <TabPane tab="Node Js" key="5">
              <div className="introbox nodeintro text-white">
                <div className="row align-items-center">
                  <div className="col-lg-3 col-md-4">
                    <div className="imgbox">
                      <img src="/static/media/gpcodersimages/nodejs-logo.png" />
                    </div>
                  </div>
                  <div className="col-lg-9 col-md-8">
                    <div className="textbox">
                      <h3 class="sub-heading font-900 text-uppercase">
                        Node Js
                      </h3>
                      <p>
                        Vanilla JS is a fast, lightweight, cross-platform
                        framework. for building incredible, powerful JavaScript
                        applications. Vanilla JS is a fast, lightweight,
                        cross-platform framework. for building incredible,
                        powerful JavaScript applications.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="projs-sec text-center">
                <ul className="d-flex">
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/framework.svg" />
                    </div>
                    <p>cross-platform framework</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/lightweight.svg" />
                    </div>
                    <p>Lightweight</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/easy-learn.svg" />
                    </div>
                    <p>Easy to use</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/fast-performance.svg" />
                    </div>
                    <p>Fast Performance</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/debug-test.svg" />
                    </div>
                    <p>Easy to debug</p>
                  </li>
                  <li>
                    <div className="circle-box">
                      <img src="/static/media/gpcodersimages/web-performance.svg" />
                    </div>
                    <p>Better web performance.</p>
                  </li>
                </ul>
              </div>
            </TabPane>
          </Tabs>
        </div>
      </div>
    </LayoutPage>
  );
}

export default JavascriptPage;
