import PoweredByVercel from "../powered-by-vercel";

function Footer() {
  return (
    <footer className="container mx-auto fixed bottom-0 flex justify-center items-center h-24">
      <a href="https://vercel.com?utm_source=next-mysql">
        <PoweredByVercel />
      </a>
    </footer>
  );
}

export default Footer;
