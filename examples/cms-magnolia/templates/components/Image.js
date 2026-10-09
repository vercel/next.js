import React from 'react';
import Image from 'next/image';

export default function MyImage(props) {
	const src =
		process.env.NEXT_PUBLIC_MGNL_HOST +
		'/dam/' +
		props.image['@id'] +
		props.image['@path'];
	return (
		<div className="Image">
			<Image
				src={src}
				alt="Etiam Purus"
				layout="fill"
				objectFit="cover"
			/>
		</div>
	);
}
