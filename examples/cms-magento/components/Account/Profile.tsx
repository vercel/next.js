import { FC } from 'react'
import FadeIn from 'react-fade-in'

import { IProfile, TCustomerAddress } from 'interfaces/profile'

const Profile: FC<IProfile> = ({ email, firstname, lastname, addresses }) => {
  return (
    <FadeIn>
      <div className="container mt-5">
        <div className="row">
          <div className="col-3">
            <h3>MY BIO</h3>
          </div>
          <div className="col-9">
            <h4>
              Hello, {firstname} {lastname}
            </h4>
            <h4>Email Address: {email}</h4>
          </div>

          {addresses && (
            <>
              <div className="col-3 mt-5">
                <h3>ADDRESSES</h3>
              </div>
              <div className="col-9 mt-5">
                {addresses.map(
                  (
                    address: TCustomerAddress,
                    i: string | number | undefined
                  ) => (
                    <div className="mb-5" key={i}>
                      <h6>
                        {address.firstname} {address.lastname}
                      </h6>
                      <h6>{address.street[0]}</h6>
                      <h6>
                        {address.city}, {address.region.region},{' '}
                        {address.country_code}
                      </h6>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </FadeIn>
  )
}

export default Profile
