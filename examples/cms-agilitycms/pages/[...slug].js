import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Container from '../components/container'
import Layout from '../components/layout'
import Head from 'next/head'
import { getAgilityPaths, getAgilityPageProps } from '../lib/api'
import CMS_PageTemplate from '../lib/components/page-template'
import { CMS_NAME } from '../lib/constants'
import { handlePreviewRedirect } from '../lib/preview'

export default function Index({ sitemapNode, page, pageTemplateName, languageCode, channelName, preview }) {
  handlePreviewRedirect();

  const router = useRouter()
  if (!router.isFallback && !page) {
    return <ErrorPage statusCode={404} />
  }

  return (
    <>
      <Layout preview={preview}>
        <Head>
          <title>Next.js Blog Example with {CMS_NAME}</title>
        </Head>
        <Container>
          {router.isFallback ? (
            <h1>Loading...</h1>
          ) : (
            <CMS_PageTemplate 
                sitemapNode={sitemapNode}
                page={page}
                pageTemplateName={pageTemplateName}
                languageCode={languageCode}
                channelName={channelName}
                preview={preview}
            />
          )}
        </Container>
      </Layout>
    </>
  )
}


export async function getStaticProps ({ params, preview}) {
  const props = await getAgilityPageProps({ params, preview });

  if(!props) {
    return { props: {} }
  }

  return {
      props: {
        sitemapNode: props.sitemapNode,
        page: props.page,
        pageTemplateName: props.pageTemplateName,
        languageCode: props.languageCode,
        channelName: props.channelName,
        preview: (preview??false)
      }
  }
  
}

export async function getStaticPaths() {  
  const paths = await getAgilityPaths();
  return {
    paths: paths,
    fallback: true
  }
}