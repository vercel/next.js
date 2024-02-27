"use client"
import { availableLanguageTags } from "@/paraglide/runtime"
import { Link, usePathname } from "@/lib/i18n"
import { Fragment } from "react"

export function LanguageSwitcher() {
	const pathname = usePathname()
	
    return availableLanguageTags.map((lang) => (
		<Fragment key={lang}>
			<Link href={pathname} locale={lang}>
				{lang}
			</Link>
		</Fragment>
	))
}
