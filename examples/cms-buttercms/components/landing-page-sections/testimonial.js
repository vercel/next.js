export default function Testimonial({ quote, name, title }) {
  return (
    <div className="single-testimonial">
      <div className="quote">
        <i className="lni lni-quotation"></i>
      </div>
      <div className="content">
        <p>{quote}</p>
      </div>
      <div className="info">
        <h6>{name}</h6>
        <p>{title}</p>
      </div>
    </div>
  );
}
