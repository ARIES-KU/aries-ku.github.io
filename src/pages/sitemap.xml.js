// Static sitemap: list every public page here when one is added.
const PAGES = ['/', '/mission/', '/research/', '/people/', '/projects/', '/publications/', '/contact/', '/th/', '/th/contact/'];

export function GET({ site }) {
  const base = site ?? new URL('https://aries-ku.github.io');
  const today = new Date().toISOString().slice(0, 10);
  const urls = PAGES.map((p) => `  <url><loc>${new URL(p, base).href}</loc><lastmod>${today}</lastmod></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
