import type { AvailableLanguageTag } from "@/paraglide/runtime"
import * as m from "@/paraglide/messages.js"
import { createI18n } from "@inlang/paraglide-js-adapter-next"

export const { Link, usePathname, useRouter, middleware, redirect, permanentRedirect } = createI18n<AvailableLanguageTag>({
    pathnames: {
        "/about": m.about_path
    },
    exclude: ["/api", /^\/api(\/.*)?$/]
});