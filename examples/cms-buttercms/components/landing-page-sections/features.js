import Feature from "./feature";

export default function Features({
  headline,
  subheadline,
  features,
  scrollAnchorId,
}) {
  return (
    <section id={scrollAnchorId} className="feature-section">
      <div className="container">
        <div className="row">
          <div className="col-lg-5 col-md-10">
            <div className="section-title mb-60">
              <h2 className="mb-20">{headline}</h2>
              <p>{subheadline}</p>
            </div>
          </div>

          <div className="col-lg-7">
            <div className="row">
              {features.map((feature, index) => (
                <Feature
                  key={index}
                  headline={feature.headline}
                  description={feature.description}
                  icon={feature.icon}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
