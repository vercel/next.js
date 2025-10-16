import { Detail } from '../../components/Detail'

const photos: Record<string, { id: string; src: string; alt: string }> = {
	'1': { id: '1', src: '/photos/1.jpg', alt: 'Photo 1' },
	'2': { id: '2', src: '/photos/2.jpg', alt: 'Photo 2' },
	'3': { id: '3', src: '/photos/3.jpg', alt: 'Photo 3' },
}

export default function Page({ params }: { params: { slug: string } }) {
	const item = photos[params.slug] ?? photos['1']
	return <Detail id={item.id} src={item.src} alt={item.alt} />
}

