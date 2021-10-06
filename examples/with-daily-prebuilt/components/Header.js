import Image from 'next/image'

export default function Header() {
  return (
    <header className="row header-container">
      <div className="row wrapper">
        <div className="row">
          <div className="logo">
            <Image src="/logo.png" alt="Daily" width={60} height={24} />
          </div>
          <h1>Daily Prebuilt demo</h1>
        </div>
        <div className="row">
          <a
            className="buttonish"
            href="https://docs.daily.co/docs/"
            target="_blank"
            rel="noopener noreferrer"
          >
            API docs
          </a>
        </div>
      </div>
      <style>
        {`
      .header-container {
        background-color: var(--white);
        border-bottom: 1px solid var(--grey);
        padding: 0 24px;
      }
      h1 {
        font-size: 16px;
      }
      .wrapper {
        max-width: 1200px;
        width: 100%;
        margin: auto;
        padding: 4px 0 4px 24px;
      }
      .logo {
        margin-right: 24px;
      }
      a.buttonish {
        color: var(--dark-blue);
        background: var(--white);
        border: 1px solid var(--grey);
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 12px;
        line-height: 16px;
        font-weight: bold;
        cursor: pointer;
        text-decoration: none;
      }
      a.buttonish:active {
        background: var(--grey-lightest);
      }
    `}
      </style>
    </header>
  )
}
