"""Builds src/assets/next/thailand.json for the Decisions step of ARIES Next (dev and preview builds only).

Input: scripts/next/roads_th.json from roads_extract.py (OpenStreetMap main roads, ODbL; COD-AB boundary, CC BY-IGO).
Adds an INVENTED event for an illustration: a rain band entering from the east and leaving to the west-northwest.
The bridges it passes are ranked for inspection (act first / next / monitor) from an invented intensity, an
invented importance by road class and an invented vulnerability. None of it comes from any unpublished analysis.
Coordinates go out rounded to 1 km, which is below one pixel at the size the map is drawn.

Two other versions of this step (a screening map, a connectivity view) and the code that built their data are
archived at git tag next-decisions-variants-2026-10-04.

Usage: python scripts/next/thailand_data.py [--preview out.png]     (needs numpy; matplotlib for --preview)"""
import argparse, json, math
from pathlib import Path
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--preview', help='also draw the end state into this PNG, to check the data by eye')
args = ap.parse_args()

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'src' / 'assets' / 'next' / 'thailand.json'
D = json.load(open(HERE / 'roads_th.json'))
LON0, LAT0 = 100.6, 13.0
KX, KY = 111.32 * math.cos(math.radians(LAT0)), 110.57
km = lambda lon, lat: np.array([(lon - LON0) * KX, (lat - LAT0) * KY])

rings = [np.array(r) for r in D['boundary']]
allxy = np.vstack(rings)
x0, y0, x1, y1 = allxy[:, 0].min(), allxy[:, 1].min(), allxy[:, 0].max(), allxy[:, 1].max()
B = np.array(D['bridges'])
bx, by, bc = B[:, 0], B[:, 1], B[:, 2].astype(int)
CELL = 10.0

# the invented event: a band of rain with a textured footprint, travelling along a straight track
P0, P1 = km(106.0, 15.0), km(98.0, 17.6)
SU, SV, HOT = 85.0, 120.0, 0.62
L = float(np.linalg.norm(P1 - P0))
dvec = (P1 - P0) / L
nvec = np.array([-dvec[1], dvec[0]])
rng = np.random.default_rng(5)
K = 16
kx, ky, ph = rng.normal(0, 1 / 70, K), rng.normal(0, 1 / 70, K), rng.uniform(0, 2 * np.pi, K)
AMP = 0.22

def tex(x, y):              # texture of the band, the same formula as the shader's (through a 10 km texture)
    s = sum(np.cos(kx[i] * x + ky[i] * y + ph[i]) for i in range(K))
    return np.clip(0.5 + AMP * s / np.sqrt(K / 2), 0, 1)

def peak(x, y, s=1.0):      # the highest intensity a point has seen once the band centre has travelled s of the track
    u = (x - P0[0]) * dvec[0] + (y - P0[1]) * dvec[1]
    v = (x - P0[0]) * nvec[0] + (y - P0[1]) * nvec[1]
    du = u - np.clip(u, 0, s * L)
    return np.exp(-0.5 * ((du / SU) ** 2 + (v / SV) ** 2)) * (0.55 + 0.9 * tex(x, y))

H = peak(bx, by)
imp = np.array([1.0, 0.85, 0.7])[bc]                                   # invented importance by road class
vuln = np.exp(np.random.default_rng(11).normal(0, 0.35, bx.size))      # invented vulnerability
score = np.where(H > HOT, H * imp * vuln, 0)
order = np.argsort(-score)
cls = np.zeros(bx.size, int)
cls[H > HOT] = 1             # monitor
cls[order[3:15]] = 2         # next
cls[order[:3]] = 3           # act first
print(f'event: {int((H > HOT).sum())} bridges passed, act first {order[:3].tolist()}')

def flat(poly):
    out, last = [], None
    for x, y in poly:
        q = (int(round(x)), int(round(y)))
        if q != last: out += q; last = q
    return out
roads = []
for c, name in enumerate(('motorway', 'trunk', 'primary')):
    for pl in D['roads'][name]:
        f = flat(pl)
        if len(f) >= 4: roads.append([c] + f)
r6 = lambda a: [float(f'{v:.6g}') for v in a]
data = {
    '_source': {
        'roads': D['_source']['roads'],
        'boundary': D['_source']['boundary'],
        'invented': 'The event, its track and every score under "event" are invented for an illustration. '
                    'They are not an assessment of any road or bridge.',
        'frame': D['_source']['projection'] + '; rounded to 1 km',
        'built_by': 'scripts/next/thailand_data.py'},
    'bbox': [int(math.floor(x0)), int(math.floor(y0)), int(math.ceil(x1)), int(math.ceil(y1))],
    'cell': CELL,
    'boundary': [flat(r) for r in D['boundary']],
    'roads': roads,
    'bridges': [int(round(v)) if k % 3 < 2 else int(v) for k, v in enumerate(B.ravel())],
    'event': {'track': r6([*P0, *P1]), 'sig': [SU, SV], 'hot': HOT, 'tex': r6(np.c_[kx, ky, ph].ravel()), 'amp': AMP,
              'cls': cls.tolist(), 'first': [int(i) for i in order[:3]]},
}
OUT.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
print('written', OUT, OUT.stat().st_size // 1024, 'KB')

if args.preview:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.collections import LineCollection
    fig, ax = plt.subplots(figsize=(6, 9), dpi=100, facecolor='#05070C')
    rb = lambda f: np.array(f).reshape(-1, 2)
    Bw = np.array(data['bridges']).reshape(-1, 3)
    ax.set_facecolor('#05070C'); ax.set_aspect('equal'); ax.axis('off')
    for r in data['boundary']: ax.plot(*rb(r).T, color='#1E9BE9', lw=0.5)
    ax.add_collection(LineCollection([rb(r[1:]) for r in data['roads']], colors='#5CC8FF', linewidths=0.4, alpha=0.5))
    for c, col, ms in [(1, '#1E9BE9', 2), (2, '#E8EEF6', 4), (3, '#FFB020', 7)]:
        m = cls == c
        ax.plot(Bw[m, 0], Bw[m, 1], 'o', color=col, ms=ms, mec='none')
    ax.set_xlim(x0 - 30, x1 + 30); ax.set_ylim(y0 - 20, y1 + 20)
    fig.savefig(args.preview, facecolor='#05070C')
    print('preview', args.preview)
