import React from 'react'
import Image from 'next/image'

export default function TeamSection({ ourTeam }) {
  return (
    <div className="about-team-section">
      <div className="team-head-section">
        {ourTeam.title_h2 && (
          <h2 {...ourTeam.$?.title_h2}>{ourTeam.title_h2}</h2>
        )}
        {ourTeam.description ? (
          <p {...ourTeam.$?.description}>{ourTeam.description}</p>
        ) : (
          ''
        )}
      </div>
      <div className="team-content">
        {ourTeam.employees?.map((employee, index) => (
          <div className="team-details" key={index} {...employee.image.$?.url}>
            {employee.image && (
              <Image
                alt={employee.image.filename}
                src={employee.image.url}
                width={280}
                height={360}
                layout="fixed"
              />
            )}
            <div className="team-details">
              {employee.name && <h3 {...employee.$?.name}>{employee.name}</h3>}
              {employee.designation && (
                <p {...employee.$?.designation}>{employee.designation}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
