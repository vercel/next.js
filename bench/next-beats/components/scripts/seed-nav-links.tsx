// Pre-hydration script. Sets `aria-current="page"` on the matching NavLink
// during HTML parse, so the active style is correct on first paint instead
// of waiting for the Suspense boundary inside NavLink to resolve.
//
// Without this, the resolved tree streams in slightly after paint and the
// active link visibly flips from inactive to active — which is especially
// jarring if the user happens to be hovering the link at that moment.
export function SeedNavLinks() {
  const html = `(function(){
  var path = location.pathname.split('?')[0].split('#')[0].split('/').filter(Boolean);
  document.querySelectorAll('a[data-nav-link]').forEach(function(a){
    var want = (a.getAttribute('href') || '').split('?')[0].split('#')[0].split('/').filter(Boolean);
    var active = want.length === path.length && want.every(function(s, i){ return s === path[i]; });
    if (active) a.setAttribute('aria-current', 'page');
  });
})()`;
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
