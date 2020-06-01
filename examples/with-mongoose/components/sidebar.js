import Link from 'next/link'
import PropTypes from 'prop-types'

const dateFormat = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'long',
})
const SideBar = ({ archives }) => (
  <aside className="col-md-4 blog-sidebar">
    <div className="p-4">
      <h4 className="font-italic">Archives</h4>
      <ol className="list-unstyled mb-0">
        {archives?.map((archive) => {
          const from = new Date(archive._id.year, archive._id.month - 1, 1)
          const to = new Date(archive._id.year, archive._id.month, 1)

          return (
            <li key={`${archive._id.year}-${archive._id.month}`}>
              <Link
                href={`?from=${from
                  .toISOString()
                  .substr(0, 10)}&to=${to.toISOString().substr(0, 10)}`}
              >
                <a className="btn btn-link px-0">
                  {dateFormat.format(from)}&nbsp;({archive.total})
                </a>
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  </aside>
)
SideBar.propTypes = {
  archives: PropTypes.arrayOf(
    PropTypes.shape({
      _id: PropTypes.shape({
        year: PropTypes.number.isRequired,
        month: PropTypes.number.isRequired,
      }).isRequired,
      total: PropTypes.number.isRequired,
    })
  ).isRequired,
}

export default SideBar
