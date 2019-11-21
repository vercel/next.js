/* eslint-env jest */
import React from 'react'
import { shallow } from 'enzyme'

import Overview from './../Overview'

const __CARS__ = [
  {
    make: 'Volvo',
    model: 'C30',
    engine: 'T5',
    year: 2018,
    mileage: 123,
    equipment: ['Leather', 'Seat heating', 'City Safety'],
  },
  {
    make: 'Volvo',
    model: 'XC60',
    engine: 'D5',
    year: 2018,
    mileage: 456,
    equipment: ['Leather', 'Seat heating', 'City Safety'],
  },
  {
    make: 'Volvo',
    model: 'XC90',
    engine: 'T6',
    year: 2018,
    mileage: 789,
    equipment: ['Leather', 'Seat heating', 'City Safety'],
  },
]

describe('Cars overview', () => {
  it('renders the h1 title', () => {
    const overview = shallow(<Overview cars={[]} />)
    expect(overview.find('h1').text()).toEqual('Cars Overview')
  })

  it('renders empty cars list when no cars are provided', () => {
    const overview = shallow(<Overview cars={[]} />)
    expect(
      overview
        .find('.Cars__List')
        .children()
        .find('p')
        .text()
    ).toEqual('No cars')
  })

  it('renders cars list with 3 items when 3 cars are provided', () => {
    const overview = shallow(<Overview cars={__CARS__} />)
    expect(
      overview
        .find('.Cars__List')
        .children()
        .find('ul')
        .children()
    ).toHaveLength(3)
  })

  it('renders cars list with the expected item on third place', () => {
    const overview = shallow(<Overview cars={__CARS__} />)
    expect(
      overview
        .find('.Cars__List')
        .children()
        .find('ul')
        .childAt(2)
        .text()
    ).toEqual('Volvo XC90')
  })

  it('renders car detail after clicking on an item in cars list', () => {
    const overview = shallow(<Overview cars={__CARS__} />)
    overview
      .find('.Cars__List')
      .children()
      .find('ul')
      .childAt(1)
      .simulate('click', { preventDefault() {} })

    expect(
      overview
        .update()
        .find('.CarInfo')
        .find('h2')
        .text()
    ).toEqual('Volvo XC60')
  })
})
