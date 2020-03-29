import React from 'react';
import Wave from '../Wave';
import Link from 'next/link';
class FooterPage extends React.Component {
  render() {
    return (
      <div className="site-footer">
        <div className="footer-form footer-bg">
          <Wave />
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
        <div className="footer-copyright copyright-bg">
          <div className="container">
            <div className="row align-items-center">
              <div className="col-md-6">Copyright &copy; 2020 GPcoders</div>
              <div className="col-md-6">
                <div className="social">
                  <Link>
                    <a href target="_blank">
                      <i className="fab fa-facebook-f" />
                    </a>
                  </Link>
                  <Link>
                    <a href target="_blank">
                      <i className="fab fa-twitter" />
                    </a>
                  </Link>
                  <Link>
                    <a href target="_blank">
                      <i className="fab fa-instagram" />
                    </a>
                  </Link>
                  <Link>
                    <a href target="_blank">
                      <i className="fab fa-linkedin-in" />
                    </a>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
export default FooterPage;
