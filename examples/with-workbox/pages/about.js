import React from 'react'
import Link from 'next/link'

const contributors = [
	{pic: 'https://github.com/addyosmani.png', label: 'Addi'},
	{pic: 'https://github.com/alexchopin.png', label: 'AlexChopin'},
	{pic: 'https://github.com/WebReflection.png', label: 'Andrea'},
	{pic: 'https://github.com/anubhav7495.png', label: 'Anubhav'},
	{pic: 'https://github.com/atinux.png', label: 'Sebastien'},
	{pic: 'https://github.com/chrisdwheatley.png', label: 'Chris'},
	{pic: 'https://github.com/azakus.png', label: 'Dan'},
	{pic: 'https://github.com/yyx990803.png', label: 'Evan'},
	{pic: 'https://github.com/housseindjirdeh.png', label: 'Houssein'},
	{pic: 'https://github.com/ragingwind.png', label: 'Jimmy'},
	{pic: 'https://github.com/insin.png', label: 'Jonny'},
	{pic: 'https://github.com/kevinpschaaf.png', label: 'Kevin'},
	{pic: 'https://github.com/kristoferbaxter.png', label: 'kristofer'},
	{pic: 'https://github.com/pi0.png', label: 'Pooya'},
	{pic: 'https://github.com/Rich-Harris.png', label: 'Rich'},
	{pic: 'https://github.com/chimon2000.png', label: 'Ryan'},
	{pic: 'https://github.com/sorvell.png', label: 'Steve'}
]

const About = () => (
  <div>
  		<Link href="/"><a>Back Home</a></Link>
      <h2>This is the Page about HN PWA contributors</h2>

		{
			contributors.map((person, i) => (<span key={`span-${i}`}>
				<img style={{width: 50, height: 50, borderRadius: '50%'}} src={person.pic} className="images" />
			</span>))
		}
  </div>
)

export default About
