// ARIES Next home: small behaviours that run everywhere, and the 3D scene loaded after first paint when html.nx-live
// is set (WebGL 2, no reduced-motion request, no Save-Data). Any failure falls back to the static frames.
export function boot(): void {
  const root = document.documentElement;

  const header = document.querySelector<HTMLElement>('[data-header]');
  const solid = () => header?.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.55);
  solid();
  window.addEventListener('scroll', solid, { passive: true });

  // the step crossing the middle of the screen is "active" (draws the reliability schematic)
  const steps = Array.from(document.querySelectorAll<HTMLElement>('[data-step]'));
  if ('IntersectionObserver' in window && steps.length) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) steps.forEach((s) => s.toggleAttribute('data-active', s === e.target));
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach((s) => io.observe(s));
  }

  if (!root.classList.contains('nx-live')) return;
  const start = () => {
    import('./scene')
      .then((m) => m.startScene())
      .catch(() => root.classList.remove('nx-live'));
  };
  const later = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 1200 }) : window.setTimeout(cb, 250));
  if (document.readyState === 'complete') later(start);
  else window.addEventListener('load', () => later(start), { once: true });
}
