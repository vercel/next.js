import { Link } from "./i18n";
import * as m from "@/paraglide/messages.js";

export function Navigation() {
    return (
        <nav style={{ display: "flex", gap: "1rem" }}>
            <Link href="/">{m.home_link_label()}</Link>
            <Link href="/about">{m.about_link_label()}</Link>
        </nav>
    );
}