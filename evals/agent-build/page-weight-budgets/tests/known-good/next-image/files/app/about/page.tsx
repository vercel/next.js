import Image from 'next/image'

const team = [
  { name: 'Mara Lindqvist', role: 'Founder', photo: '/photos/team-1.jpg' },
  { name: 'Tomás Reyes', role: 'Head of product', photo: '/photos/team-2.jpg' },
  {
    name: 'Priya Natarajan',
    role: 'Field testing',
    photo: '/photos/team-3.jpg',
  },
  { name: 'Jun Park', role: 'Customer care', photo: '/photos/team-4.jpg' },
]

export default function AboutPage() {
  return (
    <main>
      <h1>About Ridgeline</h1>
      <p>
        We test every piece of gear on the trail before it reaches the shop.
      </p>
      <ul className="team">
        {team.map((m) => (
          <li key={m.name}>
            <Image
              src={m.photo}
              alt={m.name}
              width={240}
              height={240}
              className="team-photo"
            />
            <h2>{m.name}</h2>
            <p>{m.role}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
