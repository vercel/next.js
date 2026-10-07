'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { SharedImage } from './SharedImage'

export function Detail({ id, src, alt }: { id: string; src: string; alt: string }) {
	return (
		<div style={{ display: 'grid', gap: 16 }}>
			<Link href="/">← Back</Link>
			<SharedImage id={id} src={src} alt={alt} width={1200} height={1200} />
			<motion.p layout>
				Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent libero.
			</motion.p>
		</div>
	)
}

