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

  // review only: which variant of the decisions step to show (html[data-dv]); ?dv= wins, then the last choice
  const dvBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-dv-btn]'));
  if (dvBtns.length) {
    const ok = (v: number) => v === 1 || v === 2 || v === 3;
    let dv = Number(new URLSearchParams(window.location.search).get('dv'));
    if (!ok(dv)) { try { dv = Number(window.localStorage.getItem('nx-dv')); } catch { dv = 1; } }
    const setDv = (v: number) => {
      root.dataset.dv = String(v);
      dvBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.dvBtn) === v)));
      try { window.localStorage.setItem('nx-dv', String(v)); } catch { /* storage blocked: the choice lasts for this page only */ }
      window.dispatchEvent(new Event('nx:dv'));
    };
    setDv(ok(dv) ? dv : 1);
    dvBtns.forEach((b) => b.addEventListener('click', () => setDv(Number(b.dataset.dvBtn))));
  }

  if (!root.classList.contains('nx-live')) return;
  const start = () => {
    import('./scene')
      .then((m) => m.startScene())
      .catch(() => root.classList.remove('nx-live'));
  };
  const later = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 1200 }) : setTimeout(cb, 250));
  if (document.readyState === 'complete') later(start);
  else window.addEventListener('load', () => later(start), { once: true });
}
