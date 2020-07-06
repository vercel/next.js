import { FC } from 'react'

type TLoader = {
  loading?: Boolean
}

const Loader: FC<TLoader> = ({ loading }) => {
  if (loading === false) {
    return null
  }

  return (
    <div className="container">
      <div className="row">
        <div
          className="col-12 text-center"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%)`,
          }}
        >
          <img src="/icons/loader.gif" className="img-fluid" alt="" />
        </div>
      </div>
    </div>
  )
}

export default Loader
