// Behaviour shared by every ARIES Next page: the header turns solid once the page scrolls, sections marked
// data-reveal get one scan line as they first enter the view, and "Copy" buttons copy the email address.
// Without JavaScript, or with reduced motion requested, everything simply shows.
export function ui(solidAfter: () => number = () => 24): void {
  const root = document.documentElement;

  const header = document.querySelector<HTMLElement>('[data-header]');
  const solid = () => header?.classList.toggle('is-solid', window.scrollY > solidAfter());
  solid();
  window.addEventListener('scroll', solid, { passive: true });

  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (sections.length && 'IntersectionObserver' in window && !reduce) {
    root.classList.add('nx-reveal');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    sections.forEach((s) => io.observe(s));
  }

  document.querySelectorAll<HTMLButtonElement>('button[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const old = btn.textContent;
      try {
        await navigator.clipboard.writeText(btn.dataset.copy || '');
        btn.textContent = btn.dataset.done || 'Copied';
      } catch {
        const code = btn.parentElement?.querySelector('a');
        if (code) { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); }
      }
      setTimeout(() => { btn.textContent = old; }, 1600);
    });
  });
}
