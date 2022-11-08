import Image from 'next/image'

export default function TwoColumnWithImage({
  headline,
  subheadline,
  buttonLabel,
  buttonUrl,
  image,
  imagePosition,
  scrollAnchorId,
}) {
  return (
    <section id={scrollAnchorId} className="cta-section">
      <div className="container">
        <div className="row">
          {image && imagePosition === 'left' && (
            <div className="col-lg-6 order-last order-lg-first">
              <div className="left-image cta-image ">
                <Image
                  src={image}
                  layout="responsive"
                  height="400px"
                  width="600px"
                  alt=""
                />
              </div>
            </div>
          )}
          <div className="col-lg-6">
            <div className="cta-content-wrapper">
              <div className="section-title">
                <h2 className="mb-20">{headline}</h2>
                <div dangerouslySetInnerHTML={{ __html: subheadline }} />
              </div>
              <a
                href={buttonUrl}
                className="main-btn btn-hover border-btn mt-30"
              >
                {buttonLabel}
              </a>
            </div>
          </div>
          {image && imagePosition === 'right' && (
            <div className="col-lg-6">
              <div className="right-image cta-image text-lg-end">
                <Image
                  src={image}
                  layout="responsive"
                  height="400px"
                  width="600px"
                  alt=""
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
