import PropTypes from 'prop-types'

const Footer = ({ onBackToTop }) => (
  <footer className="blog-footer">
    <p>
      Blog template built for <a href="https://getbootstrap.com/">Bootstrap</a>{' '}
      by <a href="https://twitter.com/mdo">@mdo</a>.
    </p>
    <p>
      <a
        onClick={(event) => {
          event.preventDefault()
          onBackToTop()
        }}
        href="#"
      >
        Back to top
      </a>
    </p>
  </footer>
)
Footer.propTypes = {
  onBackToTop: PropTypes.func.isRequired,
}

export default Footer
