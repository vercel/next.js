use turbo_tasks::{RcStr, Vc};

pub(crate) mod resolve;
pub(crate) mod transforms;
pub(crate) mod webpack_rules;

#[turbo_tasks::function]
pub fn next_js_special_exports() -> Vc<Vec<RcStr>> {
    Vc::cell(
        [
            "config",
            "middleware",
            "runtime",
            "revalidate",
            "dynamic",
            "dynamicParams",
            "fetchCache",
            "preferredRegion",
            "maxDuration",
            "generateStaticParams",
            "metadata",
            "generateMetadata",
            "getServerSideProps",
            "getInitialProps",
            "getStaticProps",
        ]
        .into_iter()
        .map(RcStr::from)
        .collect::<Vec<RcStr>>(),
    )
}
