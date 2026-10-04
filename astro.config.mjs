// @ts-check
import { defineConfig } from 'astro/config';

// ARIES Next (/next/), the futuristic version under review, is added only to `npm run dev` and to preview builds
// (PUBLIC_PREVIEW=true). A live build does not include its pages, scripts, styles or images at all.
const ariesNext = {
  name: 'aries-next',
  hooks: {
    /** @param {{ command: string, injectRoute: (r: { pattern: string, entrypoint: string }) => void }} o */
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev' || process.env.PUBLIC_PREVIEW === 'true') {
        injectRoute({ pattern: '/next/[...slug]', entrypoint: './src/next/route.astro' });
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({
  // change to https://aries-ku.org when the domain is registered (and add public/CNAME)
  site: 'https://aries-ku.github.io',
  // the dev toolbar sits over the white / navy switch on phone widths, and reviewers do not need it
  devToolbar: { enabled: false },
  integrations: [ariesNext],
  // pre-bundle three.js for the dev server, so the Next scene's lazy import never meets a stale dependency
  vite: { optimizeDeps: { include: ['three'] } },
});
