import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body style={{ padding: 24 }}>{children}</body>
		</html>
	)
}

