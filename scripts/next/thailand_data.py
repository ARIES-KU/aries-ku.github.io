"""Builds src/assets/next/thailand.json for the Decisions step of ARIES Next (dev and preview builds only).

Input: scripts/next/roads_th.json from roads_extract.py (OpenStreetMap main roads, ODbL; COD-AB boundary, CC BY-IGO).
Adds the data for three review variants of the step. EVERYTHING THEY ADD IS INVENTED, for an illustration:
  1. an event crosses the network and the bridges it passes are ranked for inspection: act first / next / monitor
  2. a screening map: a made-up hazard layer on 10 km cells, its top decile, and the roads and bridges on those cells
  3. connectivity: the same event closes some motorway and trunk bridges, city-to-city routes detour, and the closed
     bridges are ranked by how much travel time reopening each one gives back
None of it comes from any unpublished analysis. Coordinates go out rounded to 1 km, which is below one pixel.

Usage: python scripts/next/thailand_data.py [--preview out.png]     (needs numpy, networkx, shapely, matplotlib)"""
import argparse, json, math
from pathlib import Path
import numpy as np
import networkx as nx
from matplotlib.path import Path as MPath
from shapely.geometry import LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree

ap = argparse.ArgumentParser()
ap.add_argument('--preview', help='also draw the three end states into this PNG, to check the data by eye')
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

# ---- 1. an invented event: a rain band entering from the east and leaving to the west-northwest
P0, P1 = km(106.0, 15.0), km(98.0, 17.6)
SU, SV, HOT = 85.0, 120.0, 0.62
L = float(np.linalg.norm(P1 - P0))
dvec = (P1 - P0) / L
nvec = np.array([-dvec[1], dvec[0]])
rng = np.random.default_rng(5)
K1 = 16
kx1, ky1, ph1 = rng.normal(0, 1 / 70, K1), rng.normal(0, 1 / 70, K1), rng.uniform(0, 2 * np.pi, K1)

def tex(x, y):              # texture of the band, the same formula as the shader's (via a 10 km texture)
    s = sum(np.cos(kx1[i] * x + ky1[i] * y + ph1[i]) for i in range(K1))
    return np.clip(0.5 + 0.22 * s / np.sqrt(K1 / 2), 0, 1)

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
cls1 = np.zeros(bx.size, int)
cls1[H > HOT] = 1            # monitor
cls1[order[3:15]] = 2        # next
cls1[order[:3]] = 3          # act first
print(f'1  event: {int((H > HOT).sum())} bridges passed, act first {order[:3].tolist()}')

# ---- 2. an invented screening layer; the seed keeps its top decile away from the upper north and the far south
rng = np.random.default_rng(43)
K2 = 14
kx2, ky2, ph2 = rng.normal(0, 1 / 160, K2), rng.normal(0, 1 / 160, K2), rng.uniform(0, 2 * np.pi, K2)
f2 = lambda x, y: 0.5 + 0.2 * sum(np.cos(kx2[i] * x + ky2[i] * y + ph2[i]) for i in range(K2)) / np.sqrt(K2 / 2)
gx, gy = np.meshgrid(np.arange(np.floor(x0 / CELL) * CELL, x1, CELL), np.arange(np.floor(y0 / CELL) * CELL, y1, CELL))
cx, cy = gx.ravel() + CELL / 2, gy.ravel() + CELL / 2
inside = np.zeros(cx.size, bool)
for r in rings: inside |= MPath(r).contains_points(np.c_[cx, cy])
v2 = f2(cx[inside], cy[inside])
p90 = float(np.percentile(v2, 90))
print(f'2  screening: {int(inside.sum())} cells, top decile from {p90:.4f}')

# ---- 3. connectivity on the real main-road graph (noded at crossings, vertices within 0.8 km merged)
SPEED = {0: 90.0, 1: 70.0, 2: 55.0}
lines, lcls = [], []
for c, name in enumerate(('motorway', 'trunk', 'primary')):
    for pl in D['roads'][name]:
        lines.append(LineString(pl)); lcls.append(c)
ltree = STRtree(lines)
pts = {}
def pid(p):
    k = (round(p[0], 1), round(p[1], 1))
    if k not in pts: pts[k] = len(pts)
    return pts[k]
raw = []
for pc in unary_union(lines).geoms:
    c = lcls[int(ltree.nearest(pc.interpolate(0.5, normalized=True)))]
    cs = list(pc.coords)
    for q0, q1 in zip(cs[:-1], cs[1:]): raw.append((pid(q0), pid(q1), c, math.dist(q0, q1)))
PXY = np.array(list(pts.keys()))
parent = list(range(len(PXY)))
def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]; i = parent[i]
    return i
R = 0.8
grid = {}
for i, (x, y) in enumerate(PXY): grid.setdefault((int(x // R), int(y // R)), []).append(i)
for (gi, gj), idx in grid.items():
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            for j in grid.get((gi + di, gj + dj), []):
                for i in idx:
                    if i < j and math.dist(PXY[i], PXY[j]) < R: parent[find(i)] = find(j)
G = nx.Graph()
for i, j, c, d in raw:
    a, b = find(i), find(j)
    w = d / SPEED[c] * 60
    if a == b or (G.has_edge(a, b) and G.edges[a, b]['w'] <= w): continue
    G.add_edge(a, b, w=w)
for n in G.nodes: G.nodes[n]['xy'] = tuple(PXY[n])
ids = np.array(list(G.nodes))
NXY = np.array([G.nodes[n]['xy'] for n in ids])
for n in [n for n in G.nodes if G.degree(n) == 1]:      # a dead end within 4 km of another road joins it
    x, y = G.nodes[n]['xy']
    d = np.hypot(NXY[:, 0] - x, NXY[:, 1] - y)
    near = nx.single_source_shortest_path_length(G, n, cutoff=8)
    for j in np.argsort(d)[:40]:
        if d[j] > 4.0: break
        if int(ids[j]) in near: continue
        G.add_edge(n, int(ids[j]), w=d[j] / 40 * 60)
        break
main = G.subgraph(max(nx.connected_components(G), key=len)).copy()
mids = np.array(list(main.nodes))
mxy = np.array([main.nodes[n]['xy'] for n in mids])
edges = list(main.edges)
segs = [LineString([main.nodes[a]['xy'], main.nodes[b]['xy']]) for a, b in edges]
etree = STRtree(segs)
b_edge = []
for x, y in zip(bx, by):
    i = int(etree.nearest(Point(x, y)))
    b_edge.append(edges[i] if segs[i].distance(Point(x, y)) < 1.5 else None)

CITIES = {'BKK': (100.50, 13.75), 'KORAT': (102.10, 14.97), 'KHONKAEN': (102.83, 16.43), 'UDON': (102.79, 17.41),
          'NONGKHAI': (102.74, 17.88), 'LOEI': (101.72, 17.49), 'PHITSANULOK': (100.26, 16.82), 'PHETCHABUN': (101.16, 16.42),
          'CHAIYAPHUM': (102.03, 15.81), 'UBON': (104.85, 15.24), 'ROIET': (103.65, 16.05), 'SAKON': (104.15, 17.16),
          'MUKDAHAN': (104.72, 16.54), 'NAKHONSAWAN': (100.12, 15.70), 'CHIANGMAI': (98.98, 18.79), 'TAK': (99.13, 16.88)}
cnode = {}
for k, (lo, la) in CITIES.items():
    p = km(lo, la)
    cnode[k] = int(mids[int(np.argmin(np.hypot(mxy[:, 0] - p[0], mxy[:, 1] - p[1])))])
names = list(CITIES)
pairs = [(a, b) for i, a in enumerate(names) for b in names[i + 1:]]

def times(g):
    out = {}
    for a in names:
        dist = nx.single_source_dijkstra_path_length(g, cnode[a], weight='w')
        for b in names: out[(a, b)] = dist.get(cnode[b], math.inf)
    return out

base = times(main)
pen = lambda t, p: t if math.isfinite(t) else base[p] + 600          # a cut pair counts as a ten-hour delay
N_CLOSE = 12
cand = sorted([i for i in range(bx.size) if H[i] > HOT and b_edge[i] is not None and bc[i] < 2], key=lambda i: -H[i] * vuln[i])
closed, seen = [], set()
for i in cand:
    if b_edge[i] in seen: continue
    seen.add(b_edge[i]); closed.append(i)
    if len(closed) == N_CLOSE: break
gc = main.copy()
for i in closed: gc.remove_edge(*b_edge[i])
tc = times(gc)
loss = {p: pen(tc[p], p) - base[p] for p in pairs}
total = sum(loss.values())
benefit = []
for i in closed:
    g2 = gc.copy(); a, b = b_edge[i]; g2.add_edge(a, b, **main.edges[a, b])
    t2 = times(g2)
    benefit.append(total - sum(pen(t2[p], p) - base[p] for p in pairs))
rank3 = [closed[j] for j in np.argsort(-np.array(benefit)) if benefit[j] > 1][:3]
shown, used = [], set()
for (a, b), v in sorted(loss.items(), key=lambda kv: -kv[1]):
    if v < 1 or a in used or b in used or not nx.has_path(gc, cnode[a], cnode[b]): continue
    shown.append((a, b)); used |= {a, b}
    if len(shown) == 2: break
routes = []
for a, b in shown:
    before = nx.shortest_path(main, cnode[a], cnode[b], weight='w')
    after = nx.shortest_path(gc, cnode[a], cnode[b], weight='w')
    routes.append({'before': [main.nodes[n]['xy'] for n in before], 'after': [main.nodes[n]['xy'] for n in after]})
print(f'3  connectivity: graph {main.number_of_nodes()} nodes, {N_CLOSE} closures, reopen first {rank3}, routes shown {shown}')

# ---- write, rounded to 1 km
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
        'invented': 'The event and its track, the hazard layer, the closures, the detours and every score in v1, v2 and v3 '
                    'are invented for an illustration. They are not an assessment of any road or bridge.',
        'frame': D['_source']['projection'] + '; rounded to 1 km',
        'built_by': 'scripts/next/thailand_data.py'},
    'bbox': [int(math.floor(x0)), int(math.floor(y0)), int(math.ceil(x1)), int(math.ceil(y1))],
    'cell': CELL,
    'boundary': [flat(r) for r in D['boundary']],
    'roads': roads,
    'bridges': [int(round(v)) if k % 3 < 2 else int(v) for k, v in enumerate(B.ravel())],
    'v1': {'track': r6([*P0, *P1]), 'sig': [SU, SV], 'hot': HOT, 'tex': r6(np.c_[kx1, ky1, ph1].ravel()), 'amp': 0.22,
           'cls': cls1.tolist(), 'first': [int(i) for i in order[:3]]},
    'v2': {'modes': r6(np.c_[kx2, ky2, ph2].ravel()), 'amp': 0.2, 'p90': round(p90, 6)},
    'v3': {'closed': [int(i) for i in closed], 'rank': [int(i) for i in rank3],
           'routes': [{'before': flat(r['before']), 'after': flat(r['after'])} for r in routes]},
}
OUT.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
print('written', OUT, OUT.stat().st_size // 1024, 'KB')

if args.preview:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.collections import LineCollection
    fig, axs = plt.subplots(1, 3, figsize=(15, 9), dpi=100, facecolor='#05070C')
    rb = lambda f: np.array(f).reshape(-1, 2)
    Bw = np.array(data['bridges']).reshape(-1, 3)
    for k, ax in enumerate(axs):
        ax.set_facecolor('#05070C'); ax.set_aspect('equal'); ax.axis('off')
        for r in data['boundary']: ax.plot(*rb(r).T, color='#1E9BE9', lw=0.5)
        ax.add_collection(LineCollection([rb(r[1:]) for r in data['roads']], colors='#5CC8FF', linewidths=0.4, alpha=0.5))
        if k == 0:
            for c, col, ms in [(1, '#5CC8FF', 2), (2, '#E8EEF6', 4), (3, '#FFB020', 7)]:
                m = cls1 == c; ax.plot(Bw[m, 0], Bw[m, 1], 'o', color=col, ms=ms, mec='none')
        elif k == 1:
            top = inside.copy(); top[inside] = v2 >= p90
            ax.plot(cx[top], cy[top], 's', color='#FFB020', ms=2.2, alpha=0.4, mec='none')
        else:
            for r in data['v3']['routes']:
                ax.plot(*rb(r['before']).T, color='#5CC8FF', lw=1.4, ls='--'); ax.plot(*rb(r['after']).T, color='#E8EEF6', lw=1.4)
            ax.plot(Bw[closed, 0], Bw[closed, 1], 'x', color='#FFB020', ms=6, mew=1.5)
            for n_, i in enumerate(rank3): ax.text(Bw[i, 0] + 18, Bw[i, 1] + 10, str(n_ + 1), color='#FFB020', size=10)
        ax.set_xlim(x0 - 30, x1 + 30); ax.set_ylim(y0 - 20, y1 + 20)
    fig.savefig(args.preview, facecolor='#05070C')
    print('preview', args.preview)
