import React from 'react';
import Wave from '../Wave';
class Footer extends React.Component {
  render() {
    return (
      <div className="site-footer">
        <div className="footer-top text-center text-white">
          <div className="top-wave">
            <Wave />
          </div>
          <div className="container">
            <div className="row">
              <div className="col-md-4">
                <div className="singlecol">
                  <div className="iconbox">
                    <i className="fa fa-phone" />
                  </div>
                  <h3 className="sub-heading">Phone</h3>
                  <a href="tel:+917589201548">(+91) 814-639-0638</a>
                </div>
              </div>
              <div className="col-md-4">
                <div className="singlecol">
                  <div className="iconbox">
                    <i className="fas fa-map-marker-alt" />
                  </div>
                  <h3 className="sub-heading">Address</h3>
                  IT TOWER, E-261, Industrial Area,
                  <br />
                  Sector 74, Mohali, Punjab 160071
                </div>
              </div>
              <div className="col-md-4">
                <div className="singlecol">
                  <div className="iconbox">
                    <i className="fa fa-envelope" />
                  </div>
                  <h3 className="sub-heading">Email</h3>
                  <a href="mailto:contact@gpcoders.com">contact@gpcoders.com</a>
                </div>
              </div>
            </div>
          </div>
          <div className="bottom-wave">
            <Wave />
          </div>
        </div>
        <div className="footer-form">
          <div className="container">
            <div className="form-head text-center">
              <h3 className="sub-heading font-900">Still have questions?</h3>
              <p>
                We’re ready to answer your questions and jump start your project
              </p>
            </div>
            <form>
              <div className="row">
                <div className="col-md-4">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Name"
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Phone"
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <input
                      type="email"
                      className="form-control"
                      placeholder="Email"
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <textarea placeholder="Message" className="form-control" />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="text-center">
                    <input
                      type="submit"
                      value="Submit"
                      className="btn btn-primary"
                    />
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
        <div className="footer-copyright">
          <div className="container">
            <div className="row align-items-center">
              <div className="col-md-6">Copyright &copy; 2020 GPcoders</div>
              <div className="col-md-6">
                <div className="social">
                  <a href="#" target="_blank">
                    <i className="fab fa-facebook-f" />
                  </a>
                  <a href="#" target="_blank">
                    <i className="fab fa-twitter" />
                  </a>
                  <a href="#" target="_blank">
                    <i className="fab fa-instagram" />
                  </a>
                  <a href="#" target="_blank">
                    <i className="fab fa-linkedin-in" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default Footer;
