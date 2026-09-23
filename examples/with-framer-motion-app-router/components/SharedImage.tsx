'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

export function SharedImage({ id, src, alt, width, height }: {
	id: string
	src: string
	alt: string
	width: number
	height: number
}) {
	return (
		<motion.div layoutId={`photo-${id}`} style={{ borderRadius: 12, overflow: 'hidden' }}>
			<Image
				src={src}
				alt={alt}
				width={width}
				height={height}
				priority
				sizes="(max-width: 768px) 100vw, 33vw"
			/>
		</motion.div>
	)
}

