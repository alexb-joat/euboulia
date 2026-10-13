# Neutral icon: a soft grey rounded square with three white spokes meeting at a
# point (a crossroads, where counsel is given). Pure-Python PNG writer, no deps.
import math, struct, zlib, sys, os

def png(w, h, px):
    raw = b''.join(b'\x00' + bytes(v for p in row for v in p) for row in px)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

def dist_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def icon(n):
    S = 4  # supersample
    N = n * S
    r = N * 0.22
    cx = cy = N / 2
    spokes = [(math.radians(a)) for a in (90, 210, 330)]
    L = N * 0.30
    width = max(1.0, N * 0.075)
    out = []
    for y in range(n):
        row = []
        for x in range(n):
            acc = [0, 0, 0, 0]
            for sy in range(S):
                for sx in range(S):
                    px, py = x * S + sx + .5, y * S + sy + .5
                    # rounded square
                    qx, qy = abs(px - cx) - (N / 2 - r), abs(py - cy) - (N / 2 - r)
                    d = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
                    if d > 0: continue
                    col = (66, 66, 72, 255)
                    for a in spokes:
                        if dist_seg(px, py, cx, cy, cx + L * math.cos(a), cy - L * math.sin(a)) <= width:
                            col = (245, 245, 247, 255); break
                    if math.hypot(px - cx, py - cy) <= width * 1.5: col = (245, 245, 247, 255)
                    for i in range(4): acc[i] += col[i]
            row.append(tuple(v // (S * S) for v in acc))
        out.append(row)
    return png(n, n, out)

os.makedirs('icons', exist_ok=True)
for n in (16, 48, 128):
    open(f'icons/{n}.png', 'wb').write(icon(n))
print('icons written')
