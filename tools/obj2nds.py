#!/usr/bin/env python3
"""Converte o OBJ do mapa do Natural Disaster Survival (ilha + torre do lobby) em assets/games/nds/map.json.
Uso: python3 tools/obj2nds.py NDS_Complete_Map.obj assets/games/nds/map.json
Desloca o mapa para que o topo da ilha fique em y=0.08 e o centro dela em x=z=0."""
import collections, json, math, sys

src, dst = sys.argv[1], sys.argv[2]
V, faces, obj, mat = [], [], None, None
for line in open(src):
    t = line.split()
    if not t: continue
    if t[0] == 'v': V.append(tuple(map(float, t[1:4])))
    elif t[0] == 'o': obj = t[1]
    elif t[0] == 'usemtl': mat = t[1]
    elif t[0] == 'f': faces.append((obj, mat, [int(a.split('/')[0]) - 1 for a in t[1:]]))

COLORS = {'Reddish_brown': '#7c5c46', 'Dark_green': '#2f8a4a', 'Institutional_white_T75': '#f4f4f4', 'Medium_stone_grey': '#a3a2a5',
          'Dark_stone_grey': '#635f62', 'Sand_blue': '#74869d', 'Cyan': '#04afec', 'Mid_gray_T50': '#cdcdcd'}
OPACITY = {'Institutional_white_T75': 0.45, 'Mid_gray_T50': 0.5}
r2 = lambda x: round(x, 2)

# ---- ilha: caixas (6 faces seguidas) ----
isl = [f for f in faces if f[0] == 'Island']
boxes = []
for i in range(0, len(isl), 6):
    ch = isl[i:i + 6]
    pts = [V[v] for _, _, idx in ch for v in idx]
    boxes.append((ch[0][1], [min(p[a] for p in pts) for a in range(3)], [max(p[a] for p in pts) for a in range(3)]))
green = [b for b in boxes if b[0] == 'Dark_green']
gx0 = min(b[1][0] for b in green); gx1 = max(b[2][0] for b in green)
gz0 = min(b[1][2] for b in green); gz1 = max(b[2][2] for b in green)
cx, cz = (gx0 + gx1) / 2, (gz0 + gz1) / 2
top = max(b[2][1] for b in green)
dy = 0.08 - top
S = lambda p: (p[0] - cx, p[1] + dy, p[2] - cz)

mats = sorted(COLORS)
island = [[r2(b[1][0] - cx), r2(b[1][1] + dy), r2(b[1][2] - cz), r2(b[2][0] - cx), r2(b[2][1] + dy), r2(b[2][2] - cz), mats.index(b[0])] for b in boxes]

# ---- torre do lobby: triângulos por material ----
tw = [f for f in faces if f[0] == 'LobbyTower']
tri = collections.defaultdict(list)
for _, m, idx in tw:
    for k in range(1, len(idx) - 1):
        for v in (idx[0], idx[k], idx[k + 1]):
            tri[m].extend(r2(c) for c in S(V[v]))
floor_pts = [V[v] for _, m, idx in tw if m == 'Sand_blue' for v in idx]
lcx = (min(p[0] for p in floor_pts) + max(p[0] for p in floor_pts)) / 2
lcz = (min(p[2] for p in floor_pts) + max(p[2] for p in floor_pts)) / 2
floor_y = max(p[1] for p in floor_pts)
far = max(math.hypot(p[0] - lcx, p[2] - lcz) for p in floor_pts)
wall_pts = [V[v] for _, m, idx in tw if m == 'Institutional_white_T75' for v in idx]
wall_r = min(math.hypot(p[0] - lcx, p[2] - lcz) for p in wall_pts)
pil = [V[v] for _, m, idx in tw if m == 'Medium_stone_grey' and len(idx) == 32 for v in idx]
pil_r = max(math.hypot(p[0] - lcx, p[2] - lcz) for p in pil)
lx, lz, ly = S((lcx, floor_y, lcz))[0], S((lcx, floor_y, lcz))[2], floor_y + dy
out = {
    'mats': [{'name': m, 'color': COLORS[m], 'opacity': OPACITY.get(m, 1)} for m in mats],
    'island': island,
    'plateau': {'x0': r2(gx0 - cx), 'x1': r2(gx1 - cx), 'z0': r2(gz0 - cz), 'z1': r2(gz1 - cz)},
    'lobby': {'x': r2(lx), 'z': r2(lz), 'y': r2(ly), 'floorR': r2(far), 'wallR': r2(wall_r), 'pillarR': r2(pil_r)},
    'tower': [{'mat': m, 'pos': v} for m, v in tri.items()],
    'seaY': r2(0 + dy),
}
json.dump(out, open(dst, 'w'), separators=(',', ':'))
print('ilha', len(island), 'caixas; torre', sum(len(v) // 9 for v in tri.values()), 'triangulos', out['lobby'], out['plateau'], 'mar', out['seaY'])
