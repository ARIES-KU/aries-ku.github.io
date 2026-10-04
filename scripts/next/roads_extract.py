"""Thailand's main road network and national boundary for the ARIES Next Decisions step, from public data only.

  roads:    HOT OpenStreetMap export of Thailand roads (shapefile), (c) OpenStreetMap contributors, ODbL 1.0
  boundary: Thailand COD-AB (Royal Thai Survey Department, via OCHA), CC BY-IGO

Keeps motorway, trunk and primary roads with the OSM bridge flag, merges and simplifies them, and projects
everything to a local plane in km. Output: scripts/next/roads_th.json (a derivative database, ODbL 1.0).
Then run thailand_data.py to build src/assets/next/thailand.json.

Usage: python scripts/next/roads_extract.py --roads <hotosm_tha_roads_lines_shp.shp> --boundary <boundary .shp>
Needs numpy, pyshp and shapely. Scanning the 2.8 million road records takes a few minutes."""
import argparse, json, struct, time
from pathlib import Path
import numpy as np
import shapefile
from shapely.geometry import LineString, shape
from shapely.ops import linemerge, unary_union

ap = argparse.ArgumentParser()
ap.add_argument('--roads', required=True, help='HOT OSM roads shapefile (.shp; the .dbf and .shx sit beside it)')
ap.add_argument('--boundary', required=True, help='Thailand national boundary shapefile (.shp)')
ap.add_argument('--export-date', default='16 Feb 2025', help='date of the HOT export, for the attribution')
args = ap.parse_args()
SHP = args.roads
DBF = SHP[:-4] + '.dbf'
KEEP = {b'motorway': 0, b'trunk': 1, b'primary': 2}
OUT = Path(__file__).resolve().parent / 'roads_th.json'

# the .dbf is read directly with numpy: pyshp record by record is far too slow for 2.8 million rows
t0 = time.time()
with open(DBF, 'rb') as f:
    h = f.read(32)
    n, hlen, rlen = struct.unpack('<IHH', h[4:12])
    fields, off = {}, 1
    while True:
        d = f.read(32)
        if d[0] == 0x0D: break
        fields[d[:11].split(b'\x00')[0].decode('latin-1')] = (off, d[16]); off += d[16]
    ho, hl = fields['highway']; bo, bl = fields['bridge']
    f.seek(hlen)
    sel, cls, brg = [], [], []
    CH = 100000
    for start in range(0, n, CH):
        k = min(CH, n - start)
        a = np.frombuffer(f.read(rlen * k), dtype=np.uint8).reshape(k, rlen)
        hw = a[:, ho:ho + hl].tobytes()
        br = a[:, bo:bo + bl].tobytes()
        for i in range(k):
            c = KEEP.get(hw[i * hl:(i + 1) * hl].strip())
            if c is not None:
                sel.append(start + i); cls.append(c)
                brg.append(br[i * bl:(i + 1) * bl].strip() not in (b'', b'no'))
print(f'dbf scanned in {time.time() - t0:.0f} s: {len(sel)} main-road segments, {sum(brg)} flagged as bridges')

r = shapefile.Reader(shp=open(SHP, 'rb'), shx=open(SHP[:-4] + '.shx', 'rb'))
lines = {0: [], 1: [], 2: []}
bridges = []
for idx, c, b in zip(sel, cls, brg):
    pts = r.shape(idx).points
    if len(pts) < 2: continue
    lines[c].append(LineString(pts))
    if b:
        m = LineString(pts).interpolate(0.5, normalized=True)
        bridges.append((m.x, m.y, c))

LON0, LAT0 = 100.6, 13.0                         # local plane, km
KX, KY = 111.32 * np.cos(np.radians(LAT0)), 110.57
def to_km(coords):
    return [[round((x - LON0) * KX, 1), round((y - LAT0) * KY, 1)] for x, y in coords]

out = {'_source': {
    'roads': f'HOT OpenStreetMap export of Thailand roads, {args.export_date}, (c) OpenStreetMap contributors. '
             'This file is a derivative database made available under the Open Database License 1.0 '
             '(https://opendatacommons.org/licenses/odbl/1-0/).',
    'boundary': 'Thailand COD-AB, Royal Thai Survey Department via OCHA, CC BY-IGO',
    'projection': f'local plane in km around lon {LON0}, lat {LAT0}; x east, y north',
    'built_by': 'scripts/next/roads_extract.py'}, 'roads': {}, 'bridges': [], 'boundary': []}
TOL = {0: 0.004, 1: 0.006, 2: 0.008}             # degrees (about 0.45 to 0.9 km)
for c, name in [(0, 'motorway'), (1, 'trunk'), (2, 'primary')]:
    merged = linemerge(unary_union(lines[c]))
    geoms = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
    keep = []
    for g in geoms:
        s = g.simplify(TOL[c], preserve_topology=False)
        if s.length * 111 > 1.5: keep.append(to_km(s.coords))
    out['roads'][name] = keep
    print(name, 'polylines', len(keep), 'vertices', sum(len(p) for p in keep))

# one bridge per 3 km cell, the highest road class wins
cells = {}
for x, y, c in bridges:
    key = (round(x / 0.027), round(y / 0.027))
    if key not in cells or c < cells[key][2]: cells[key] = (x, y, c)
out['bridges'] = [[*to_km([(x, y)])[0], c] for x, y, c in cells.values()]
print('bridge points (one per 3 km cell):', len(out['bridges']))

b = shapefile.Reader(args.boundary)
geo = unary_union([shape(s.__geo_interface__) for s in b.shapes()])
parts = list(geo.geoms) if hasattr(geo, 'geoms') else [geo]
for p in parts:
    s = p.simplify(0.01, preserve_topology=True)
    if s.area > 0.02: out['boundary'].append(to_km(s.exterior.coords))
print('boundary rings', len(out['boundary']), 'vertices', sum(len(p) for p in out['boundary']))

with open(OUT, 'w') as f: json.dump(out, f, separators=(',', ':'))
print('written', OUT, OUT.stat().st_size // 1024, 'KB in', round(time.time() - t0), 's')
