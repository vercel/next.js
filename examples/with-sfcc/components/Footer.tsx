export default function Footer() {
  return (
    <footer className="center mt-5 flex justify-center space-x-4 bg-[#E7E8EF] p-4 text-xs">
      <p>Powered by Next.js, Salesforce Commerce Cloud, and Vercel </p>
      <span>|</span>
      <a
        href="https://github.com/vercel/next.js/tree/canary/examples/with-sfcc"
        className="font-medium text-orange-600"
      >
        Source code
      </a>
    </footer>
  )
}
