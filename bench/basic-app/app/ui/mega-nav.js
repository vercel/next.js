// Server-rendered marketing navigation, like production sites carry on
// every page of the marketing surface.
const MENU = {
  Products: [
    ['Previews', 'Ship faster with per-branch preview deployments'],
    ['Edge Functions', 'Run compute close to your users'],
    ['Analytics', 'Privacy-friendly, real-user performance insight'],
    ['Image Optimization', 'Serve the right image to every device'],
    ['Storage', 'Databases, blobs and caches, fully managed'],
    ['Monitoring', 'Trace every request across your stack'],
  ],
  Resources: [
    ['Docs', 'Guides and API references'],
    ['Templates', 'Production-ready starters'],
    ['Guides', 'Step-by-step tutorials'],
    ['Customers', 'Case studies from teams like yours'],
    ['Changelog', 'What shipped this week'],
    ['Community', 'Discussions and events'],
  ],
  Company: [
    ['About', 'What we believe and how we work'],
    ['Blog', 'News and engineering deep dives'],
    ['Careers', 'Join the team'],
    ['Pricing', 'Plans for every stage'],
    ['Enterprise', 'Security, scale and support'],
    ['Contact', 'Talk to us'],
  ],
}

export default function MegaNav() {
  return (
    <nav className="mega-nav" aria-label="Main">
      <ul className="mega-nav-list">
        {Object.entries(MENU).map(([section, items]) => (
          <li key={section} className="mega-nav-section">
            <span className="mega-nav-label flex items-center gap-2 text-sm">
              {section}
            </span>
            <ul className="mega-nav-panel">
              {items.map(([title, description]) => (
                <li key={title}>
                  <a
                    href={'/' + title.toLowerCase().replace(/ /g, '-')}
                    className="flex items-center gap-2 truncate text-sm"
                    data-nav-item={
                      section.toLowerCase() + ':' + title.toLowerCase()
                    }
                  >
                    <span className="mega-nav-title truncate text-sm font-medium">
                      {title}
                    </span>
                    <span className="mega-nav-desc truncate text-xs text-muted">
                      {description}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}
