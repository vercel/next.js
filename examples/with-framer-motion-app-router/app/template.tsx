'use client'

import { ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

export default function Template({ children }: { children: ReactNode }) {
	const pathname = usePathname()

	return (
		<LayoutGroup>
			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={pathname}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15 }}
				>
					{children}
				</motion.div>
			</AnimatePresence>
		</LayoutGroup>
	)
}

