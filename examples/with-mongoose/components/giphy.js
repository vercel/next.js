import PropTypes from 'prop-types'

const Giphy = ({ statusCode, statusText, src }) => (
  <div className="col-md-8 blog-main">
    <div className="jumbotron px-4 py-6 px-md-5 text-white rounded bg-dark">
      <div className="px-0 text-center">
        <h1 className="display-4 font-italic pb-3">
          {statusCode} - {statusText}
        </h1>
        <iframe
          src={src}
          width="480"
          height="480"
          frameBorder="0"
          className="giphy-embed"
          allowFullScreen
        ></iframe>
      </div>
    </div>
  </div>
)
Giphy.propTypes = {
  src: PropTypes.string.isRequired,
  statusCode: PropTypes.number,
  statusText: PropTypes.string,
}
Giphy.defaultProps = {
  statusCode: 404,
  statusText: 'Not found',
}

export default Giphy
