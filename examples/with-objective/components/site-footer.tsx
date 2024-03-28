export function SiteFooter() {
    return (
        <footer className="py-6 md:px-8 md:py-0 border-t">
            <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
                <p className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">
                    Powered by{" "}
                    <a
                        href={"https://www.objective.inc/"}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline underline-offset-4"
                    >
                        Objective
                    </a>
                    . Visit our{" "}
                    <a
                        href={"https://www.objective.inc/docs"}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline underline-offset-4"
                    >
                        Docs
                    </a>
                    .
                </p>
            </div>
        </footer>
    )
}