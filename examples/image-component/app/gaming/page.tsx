import Image, { ImageProps } from "next/image";
import ViewSource from "../../components/view-source";
import styles from "../../styles.module.css";

// Gaming-themed image component with light/dark theme support
// Optimized for high-end gaming experiences
type GamingImageProps = Omit<ImageProps, "src" | "priority" | "loading"> & {
  srcLight: string;
  srcDark: string;
  title: string;
  description: string;
};

const GamingThemeImage = (props: GamingImageProps) => {
  const { srcLight, srcDark, title, description, ...rest } = props;

  return (
    <div className={styles.gamingImageContainer}>
      <Image {...rest} src={srcLight} className={styles.imgLight} />
      <Image {...rest} src={srcDark} className={styles.imgDark} />
      <div className={styles.gamingImageInfo}>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
};

const GamingPage = () => (
  <div className={styles.container}>
    <ViewSource pathname="app/gaming/page.tsx" />
    <div className={styles.card}>
      <h1>Premium Gaming Images Collection</h1>
      <p>
        Experience high-class gaming imagery with intelligent theme detection.
        These professionally crafted images automatically adapt between light 
        and dark themes to provide the optimal viewing experience for premium 
        gaming content.
      </p>
      
      <div className={styles.gamingFeatures}>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>🎮</div>
          <h3>Professional Gaming</h3>
          <p>High-end gaming setups and esports environments</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>🌓</div>
          <h3>Theme Adaptive</h3>
          <p>Automatically switches between light and dark variants</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>⚡</div>
          <h3>Performance Optimized</h3>
          <p>Optimized for fast loading and responsive design</p>
        </div>
      </div>

      <hr className={styles.hr} />

      <h2>Elite Gaming Battlestation</h2>
      <p>
        A premium gaming setup featuring high-end peripherals, RGB lighting, 
        and professional-grade equipment. Perfect for streaming, competitive 
        gaming, and content creation.
      </p>
      <GamingThemeImage
        alt="Elite Gaming Battlestation with RGB lighting and high-end peripherals"
        srcLight="/gaming/gaming-setup-light.svg"
        srcDark="/gaming/gaming-setup-dark.svg"
        title="Premium Gaming Setup"
        description="Professional gaming battlestation with mechanical keyboard, gaming mouse, multiple monitors, and full RGB lighting ecosystem."
        width={800}
        height={600}
        style={{
          maxWidth: "100%",
          height: "auto",
        }}
      />

      <hr className={styles.hr} />

      <h2>Professional Esports Arena</h2>
      <p>
        World-class esports tournament venue with professional lighting, 
        multiple gaming stations, and championship-level atmosphere. 
        Designed for high-stakes competitive gaming events.
      </p>
      <GamingThemeImage
        alt="Professional esports tournament arena with multiple gaming stations"
        srcLight="/gaming/esports-arena-light.svg"
        srcDark="/gaming/esports-arena-dark.svg"
        title="Esports Championship Arena"
        description="Professional tournament venue featuring multiple gaming stations, large display screens, and championship-level production quality."
        width={1200}
        height={800}
        style={{
          maxWidth: "100%",
          height: "auto",
        }}
      />

      <hr className={styles.hr} />

      <h2>Elite Gaming Peripherals</h2>
      <p>
        Premium gaming equipment including mechanical keyboards, precision 
        gaming mice, professional headsets, and high-refresh-rate displays. 
        Everything you need for competitive gaming excellence.
      </p>
      <GamingThemeImage
        alt="Collection of premium gaming peripherals including keyboard, mouse, headset, and monitor"
        srcLight="/gaming/gaming-peripherals-light.svg"
        srcDark="/gaming/gaming-peripherals-dark.svg"
        title="Gaming Arsenal Collection"
        description="Complete set of professional gaming peripherals featuring mechanical keyboards, precision mice, noise-canceling headsets, and 4K gaming displays."
        width={1000}
        height={700}
        style={{
          maxWidth: "100%",
          height: "auto",
        }}
      />

      <hr className={styles.hr} />

      <div className={styles.gamingSpecs}>
        <h2>Technical Specifications</h2>
        <div className={styles.specsGrid}>
          <div className={styles.specItem}>
            <h4>Image Format</h4>
            <p>SVG (Scalable Vector Graphics)</p>
          </div>
          <div className={styles.specItem}>
            <h4>Resolution</h4>
            <p>Scalable to any size</p>
          </div>
          <div className={styles.specItem}>
            <h4>Theme Support</h4>
            <p>Light & Dark variants</p>
          </div>
          <div className={styles.specItem}>
            <h4>Optimization</h4>
            <p>Next.js Image component</p>
          </div>
        </div>
      </div>

      <hr className={styles.hr} />

      <h2>Features & Benefits</h2>
      <ul className={styles.gamingBenefits}>
        <li>✅ <strong>High-Quality Visuals:</strong> Professional-grade gaming imagery</li>
        <li>✅ <strong>Theme Intelligence:</strong> Automatic light/dark mode detection</li>
        <li>✅ <strong>Performance Optimized:</strong> Fast loading with Next.js Image component</li>
        <li>✅ <strong>Responsive Design:</strong> Looks perfect on all screen sizes</li>
        <li>✅ <strong>Gaming Focused:</strong> Specifically designed for gaming content</li>
        <li>✅ <strong>RGB Aesthetics:</strong> Modern gaming RGB lighting effects</li>
        <li>✅ <strong>Professional Quality:</strong> Suitable for commercial gaming projects</li>
      </ul>
    </div>
  </div>
);

export default GamingPage;