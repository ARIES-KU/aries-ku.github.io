"""Serve dist/ locally and take full-page screenshots of every page (desktop + one mobile) for review.
Usage: python scripts/preview-shots.py   ->  writes shots/*.png (gitignored)"""
import asyncio, functools, http.server, os, socketserver, threading
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST, OUT = ROOT / 'dist', ROOT / 'shots'
OUT.mkdir(exist_ok=True)
PORT = 4388
PAGES = ['/', '/research/', '/people/', '/projects/', '/publications/', '/contact/', '/th/', '/th/contact/', '/nope/']

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def send_error(self, code, message=None, explain=None):
        if code == 404 and (DIST / '404.html').exists():
            body = (DIST / '404.html').read_bytes()
            self.send_response(404); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers(); self.wfile.write(body)
        else:
            super().send_error(code, message, explain)

def serve():
    handler = functools.partial(Quiet, directory=str(DIST))
    with socketserver.TCPServer(('127.0.0.1', PORT), handler) as httpd:
        httpd.serve_forever()

async def main():
    threading.Thread(target=serve, daemon=True).start()
    await asyncio.sleep(0.5)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True)
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        for path in PAGES:
            await pg.goto(f'http://127.0.0.1:{PORT}{path}', wait_until='networkidle')
            name = path.strip('/').replace('/', '_') or 'home'
            await pg.screenshot(path=str(OUT / f'{name}.png'), full_page=True)
        m = await b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
        for path in ['/', '/people/']:
            await m.goto(f'http://127.0.0.1:{PORT}{path}', wait_until='networkidle')
            name = 'mobile_' + (path.strip('/').replace('/', '_') or 'home')
            await m.screenshot(path=str(OUT / f'{name}.png'), full_page=True)
        await b.close()
    print('errors:', errors or 'none')

asyncio.run(main())
