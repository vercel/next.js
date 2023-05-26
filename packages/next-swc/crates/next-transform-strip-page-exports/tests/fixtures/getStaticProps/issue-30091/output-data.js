export async function getStaticProps() {
    await import('_http_common').then((http)=>console.log(http));
    return {
        props: {}
    };
}
