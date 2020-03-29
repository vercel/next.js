import Link from 'next/link';
import React from 'react';
import { Modal, Button, Drawer, Menu } from 'antd';
class GpcodersNav extends React.Component {
  state = {
    hasScrolled: false,
    visible: false,
    navbarvisible: false
  };
  componentDidMount() {
    window.addEventListener('scroll', this.handleScroll);
  }

  handleScroll = event => {
    const scrollTop = window.pageYOffset;
    if (scrollTop > 50) {
      this.setState({ hasScrolled: true });
    } else {
      this.setState({ hasScrolled: false });
    }
  };
  showDrawer = () => {
    this.setState({
      navbarvisible: true
    });
  };
  onClose = () => {
    this.setState({
      navbarvisible: false
    });
  };
  showModal = () => {
    this.setState({
      visible: true
    });
  };

  handleOk = e => {
    console.log(e);
    this.setState({
      visible: false
    });
  };

  handleCancel = e => {
    console.log(e);
    this.setState({
      visible: false
    });
  };

  render() {
    return (
      <div
        className={
          this.state.hasScrolled ? 'site-header headerScrolled' : 'site-header'
        }>
        <div className="container">
          <div className="HeaderMain d-flex align-items-center">
            <nav className="menuBar d-flex">
              <Link href="/">
                <a href className="site-logo navbar-brand">
                  <img
                    src="/static/media/gpcodersimages/site-logo.png"
                    alt="Gp Coders"
                  />
                </a>
              </Link>
              <div className="menuCon">
                <Menu mode="horizontal" theme="dark">
                  <Menu.Item key="1">
                    <Link href="/about-us">
                      <a href> About Us</a>
                    </Link>
                  </Menu.Item>
                  <Menu.Item key="2">
                    <Link href="/services">
                      <a href> Services</a>
                    </Link>
                  </Menu.Item>
                  <Menu.Item key="3">
                    <a href> Our Work</a>
                  </Menu.Item>
                  <Menu.Item key="5">
                    <Link href="/javascript">
                      <a href> Javascript</a>
                    </Link>
                  </Menu.Item>
                  <Menu.Item key="4">
                    <a href> Contact</a>
                  </Menu.Item>
                </Menu>

                <Button
                  className="mobilebarsMenu"
                  type="primary"
                  onClick={this.showDrawer}>
                  <i className="fa fa-bars" />
                </Button>
                <Drawer
                  title="GPCODERS"
                  placement="right"
                  closable={true}
                  onClose={this.onClose}
                  visible={this.state.navbarvisible}>
                  <ul className="navbar-nav">
                    <li className="nav-item">
                      <Link href="/services">
                        <a href className="nav-link">
                          Services
                        </a>
                      </Link>
                    </li>
                    <li className="nav-item">
                      <Link href="#">
                        <a href className="nav-link">
                          Our Work
                        </a>
                      </Link>
                    </li>
                    <li className="nav-item">
                      <Link href="/javascript">
                        <a href className="nav-link">
                          Javascript
                        </a>
                      </Link>
                    </li>
                    <li className="nav-item">
                      <Link href="#">
                        <a href className="nav-link">
                          Contact
                        </a>
                      </Link>
                    </li>
                  </ul>
                </Drawer>
              </div>
            </nav>
            <Button
              className="btn btn-primary"
              type="primary"
              onClick={this.showModal}>
              Get a free quote
            </Button>
            <Modal
              visible={this.state.visible}
              onOk={this.handleOk}
              onCancel={this.handleCancel}
              className="get-quote-model">
              <div className="text-center">
                <img src="/static/media/quote-icon.svg" alt="img" />
              </div>
              <form>
                <h2 className="sub-heading font-900">Request a Quotation</h2>
                <div className="form-group">
                  <label>
                    Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    name="your-name"
                  />
                </div>
                <div className="form-group">
                  <label>
                    Email <span className="text-danger">*</span>
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    name="your-email"
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number </label>
                  <input
                    type="tel"
                    className="form-control"
                    name="your-phone"
                  />
                </div>
                <div className="form-group">
                  <label>Services That Interest You </label>
                  <select className="custom-select form-control">
                    <option>Select Service</option>
                    <option>Consultancy</option>
                    <option>Web Design</option>
                    <option>Web Development</option>
                    <option>Mobile App Development</option>
                    <option>Ecommerce Solutions</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Message </label>
                  <textarea className="form-control" />
                </div>
                <div className="form-group">
                  <input
                    type="submit"
                    className="btn-block btn btn-primary"
                    value="Submit Now"
                  />
                </div>
              </form>
            </Modal>
          </div>
        </div>
      </div>
    );
  }
}

export default GpcodersNav;
