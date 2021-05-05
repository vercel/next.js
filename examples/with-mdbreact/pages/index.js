import Head from 'next/head'
import {
  MDBBtn,
  MDBCard,
  MDBCardBody,
  MDBCardText,
  MDBCardTitle,
  MDBCol,
  MDBContainer,
  MDBFooter,
  MDBRow,
} from 'mdbreact'

export default function Home() {
  return (
    <>
      <Head>
        <title>NextJS with Material Design Bootstrap for React</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <MDBContainer className="text-center mt-5">
        <h1 className="h1-responsive font-weight-bolder">
          Welcome to <a href="https://nextjs.org">Next.js!</a>
        </h1>
        <p className="mb-3">
          Get started by editing <code>pages/index.js</code>
        </p>
        <MDBRow>
          <MDBCol sm="6">
            <MDBCard className="my-3">
              <MDBCardBody>
                <MDBCardTitle tag="h5">Documentation</MDBCardTitle>
                <MDBCardText>
                  Find in-depth information about Next.js features and API.
                </MDBCardText>
                <MDBBtn
                  color="primary"
                  size="sm"
                  className="text-capitalize"
                  href="https://nextjs.org/docs"
                >
                  More &rarr;
                </MDBBtn>
              </MDBCardBody>
            </MDBCard>
          </MDBCol>
          <MDBCol sm="6">
            <MDBCard className="my-3">
              <MDBCardBody>
                <MDBCardTitle tag="h5">Learn</MDBCardTitle>
                <MDBCardText>
                  Learn about Next.js in an interactive course with quizzes!
                </MDBCardText>
                <MDBBtn
                  color="primary"
                  size="sm"
                  className="text-capitalize"
                  href="https://nextjs.org/learn"
                >
                  More &rarr;
                </MDBBtn>
              </MDBCardBody>
            </MDBCard>
          </MDBCol>
        </MDBRow>
        <MDBRow>
          <MDBCol sm="6">
            <MDBCard className="my-3">
              <MDBCardBody>
                <MDBCardTitle tag="h5">Examples</MDBCardTitle>
                <MDBCardText>
                  Discover and deploy boilerplate example Next.js projects.
                </MDBCardText>
                <MDBBtn
                  color="primary"
                  size="sm"
                  className="text-capitalize"
                  href="https://github.com/vercel/next.js/tree/master/examples"
                >
                  More &rarr;
                </MDBBtn>
              </MDBCardBody>
            </MDBCard>
          </MDBCol>
          <MDBCol sm="6">
            <MDBCard className="my-3">
              <MDBCardBody>
                <MDBCardTitle tag="h5">Deploy</MDBCardTitle>
                <MDBCardText>
                  Instantly deploy your Next.js site to a public URL with
                  Vercel.
                </MDBCardText>
                <MDBBtn
                  color="primary"
                  size="sm"
                  className="text-capitalize"
                  href="https://vercel.com/new?utm_source=github&utm_medium=example&utm_campaign=next-example"
                >
                  More &rarr;
                </MDBBtn>
              </MDBCardBody>
            </MDBCard>
          </MDBCol>
        </MDBRow>
        <MDBFooter className="text-center mt-4" color="white">
          <span className="black-text"> Powered by</span>
          <a
            href="https://vercel.com?filter=next.js&utm_source=github&utm_medium=example&utm_campaign=next-example"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src="/vercel.svg" alt="Vercel Logo" />
          </a>
        </MDBFooter>
      </MDBContainer>
    </>
  )
}
