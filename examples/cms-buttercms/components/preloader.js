export default function Preloader() {
  return (
    <div className="preloader">
      <div className="loader">
        <div className="spinner">
          <div className="spinner-container">
            <div className="spinner-rotator">
              <div className="spinner-left">
                <div className="spinner-circle"></div>
              </div>
              <div className="spinner-right">
                <div className="spinner-circle"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
