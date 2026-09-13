'use client'

import Link from 'next/link'
import { SharedImage } from './SharedImage'

const items = [
	{ id: '1', src: '/photos/1.jpg', alt: 'Photo 1' },
	{ id: '2', src: '/photos/2.jpg', alt: 'Photo 2' },
	{ id: '3', src: '/photos/3.jpg', alt: 'Photo 3' },
]

export function Grid() {
	return (
		<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
			{items.map((item) => (
				<Link key={item.id} href={`/${item.id}`} style={{ display: 'block' }}>
					<SharedImage id={item.id} src={item.src} alt={item.alt} width={600} height={600} />
				</Link>
			))}
		</div>
	)
}

