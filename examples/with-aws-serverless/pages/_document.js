import Document, {Head, Main, NextScript} from 'next/document';

export default class Layout extends Document {
    static getInitialProps({renderPage}) {
        const {html, head, errorHtml, chunks} = renderPage();
        return {html, head, errorHtml, chunks}
    }

    render() {
        return (
            <html>
                <Head>
                </Head>
                <body>
                    <Main/>
                    <NextScript/>
                </body>
            </html>
        )
    }
}