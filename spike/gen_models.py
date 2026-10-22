# Prueba de estilo (descartable): genera grúa STS, bloque de patio con RTG, buque y tractor.
# Uso: blender -b --factory-startup -P gen_models.py -- <carpeta_salida>
# Unidades en metros. Ejes de Blender: x a lo largo del muelle, y hacia tierra (+), z arriba.
import bpy, bmesh, os, sys, random
from mathutils import Vector

argv = sys.argv
OUT = argv[argv.index('--') + 1] if '--' in argv else os.path.join(os.path.dirname(__file__), 'assets')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(h):
    h = h.lstrip('#')
    return tuple(_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


_mats = {}


def mat(name, hexcol, rough=0.75, metal=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    try:
        if not m.use_nodes:
            m.use_nodes = True
    except Exception:
        pass
    m.diffuse_color = rgba(hexcol)
    nt = m.node_tree
    if nt:
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
            out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
            nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        bsdf.inputs['Base Color'].default_value = rgba(hexcol)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
    _mats[name] = m
    return m


class MB:
    """Acumula cajas y polígonos en una sola malla con varios materiales."""

    def __init__(self):
        self.v, self.f, self.fm, self.mats = [], [], [], []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _box(self, c, ex, ey, ez, m):
        i, k = len(self.v), self.mi(m)
        for sz in (-1, 1):
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                self.v.append(c + ex * sx + ey * sy + ez * sz)
        for q in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.f.append(tuple(i + j for j in q))
            self.fm.append(k)

    def box(self, x0, y0, z0, x1, y1, z1, m):
        c = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
        self._box(c, Vector(((x1 - x0) / 2, 0, 0)), Vector((0, (y1 - y0) / 2, 0)), Vector((0, 0, (z1 - z0) / 2)), m)

    def beam(self, p1, p2, w, h, m):
        p1, p2 = Vector(p1), Vector(p2)
        d = p2 - p1
        dn = d.normalized()
        ref = Vector((0, 0, 1)) if abs(dn.z) < 0.9 else Vector((1, 0, 0))
        u = ref.cross(dn).normalized()
        v = dn.cross(u).normalized()
        self._box((p1 + p2) / 2, u * (w / 2), v * (h / 2), dn * (d.length / 2), m)

    def add(self, verts, faces, mats):
        i = len(self.v)
        self.v += [Vector(p) for p in verts]
        for j, fc in enumerate(faces):
            self.f.append(tuple(i + a for a in fc))
            self.fm.append(self.mi(mats[j] if isinstance(mats, list) else mats))

    def build(self, name, bevel=0.0):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p) for p in self.v], [], self.f)
        for i, k in enumerate(self.fm):
            me.polygons[i].material_index = k
        for m in self.mats:
            me.materials.append(m)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if bevel > 0:
            mod = ob.modifiers.new('bisel', 'BEVEL')
            mod.width = bevel
            mod.segments = 1
            mod.limit_method = 'ANGLE'
        return ob


rng = random.Random(7)
# Colores de navieras reales, sin marcas: rojo óxido, azul, verde, mostaza, gris, naranja, beige, azul oscuro
CONT = [mat(f'contenedor_{i}', c, 0.8) for i, c in enumerate(
    ['#A9442D', '#2F6EA5', '#3D7B4B', '#C49A24', '#8A949D', '#CF7228', '#DCD6C6', '#203F63'])]
CONT_W = [3, 3, 2, 2, 2, 1, 2, 2]


def cont():
    return rng.choices(CONT, CONT_W)[0]


BLUE = mat('grua_azul', '#2A64A8', 0.55, 0.2)
WHITE = mat('blanco', '#EEF0F2', 0.6)
DARK = mat('oscuro', '#2B3138', 0.7)
YEL = mat('amarillo', '#E2A300', 0.55, 0.1)
GLASS = mat('vidrio', '#1B2A38', 0.25)


def sts():
    mb = MB()
    gx, yw, yl, H = 9.0, 0.0, 30.5, 46.0
    for x in (-gx, gx):
        for y in (yw, yl):
            mb.box(x - 4, y - 1.2, 0, x + 4, y + 1.2, 1.6, DARK)          # carro de traslación
            mb.box(x - 1, y - 1, 1.6, x + 1, y + 1, H, BLUE)              # pata
        mb.box(x - 1, yw, H - 2.5, x + 1, yl, H, BLUE)                    # viga lateral superior
        mb.beam((x, yw + 1, 15.5), (x, yl - 1, H - 2.5), 0.7, 0.7, BLUE)  # diagonales
        mb.beam((x, yl - 1, 15.5), (x, yw + 1, H - 2.5), 0.7, 0.7, BLUE)
    for y in (yw, yl):
        mb.box(-gx - 1, y - 1, 13, gx + 1, y + 1, 15.5, BLUE)             # viga portal inferior
        mb.box(-gx - 1, y - 1, H - 2.5, gx + 1, y + 1, H, BLUE)           # viga portal superior
    for xg in (-3.2, 3.2):
        mb.box(xg - 0.8, -62, H + 0.5, xg + 0.8, 46, H + 4, BLUE)         # pluma
    for y in range(-60, 46, 10):
        mb.box(-3.2, y - 0.3, H + 3.4, 3.2, y + 0.3, H + 4, BLUE)
    apex = 76.0
    for s in (-1, 1):
        mb.beam((s * gx, yw, H), (s * 1.5, 5, apex), 1.4, 1.4, BLUE)      # pórtico en A
        mb.beam((s * gx, yl, H), (s * 1.5, 5, apex), 0.9, 0.9, BLUE)      # tirantes traseros
        mb.beam((s * 1.5, 5, apex), (s * 3.2, -30, H + 4), 0.45, 0.45, DARK)  # tirantes delanteros
        mb.beam((s * 1.5, 5, apex), (s * 3.2, -58, H + 4), 0.45, 0.45, DARK)
    mb.box(-2.5, 3.5, apex - 1, 2.5, 6.5, apex + 1.5, BLUE)
    mb.box(-5, 32, H + 4, 5, 46, H + 10.5, WHITE)                          # sala de máquinas
    mb.box(-4, -27, H - 1.5, 4, -19, H + 0.6, WHITE)                       # carro (trolley)
    mb.box(-1.3, -27.2, H - 5.2, 1.3, -24, H - 1.5, WHITE)                 # cabina del operador
    mb.box(-1.25, -27.25, H - 4.2, 1.25, -27.15, H - 2.2, GLASS)
    for xr in (-2.5, 2.5):
        for yr in (-23.6, -22.4):
            mb.beam((xr, yr, H - 1.5), (xr * 1.8, yr, 22.2), 0.12, 0.12, DARK)  # cables
    mb.box(-6.1, -24.2, 21.4, 6.1, -21.8, 22.2, YEL)                       # spreader
    mb.box(-6.1, -24.2, 18.8, 6.1, -21.76, 21.39, CONT[1])                 # contenedor colgado
    return [mb.build('grua_sts', bevel=0.05)]


def yard():
    rows, bays, rp, bp, cl, cw, ch = 6, 20, 2.8, 6.56, 6.06, 2.44, 2.59
    mb = MB()
    paint = mat('pintura_blanca', '#F2F2EE', 0.9)
    paint_y = mat('pintura_amarilla', '#E2B21A', 0.9)
    for r in range(rows + 1):
        y = r * rp - (rp - cw) / 2
        mb.box(-1, y - 0.07, 0, bays * bp, y + 0.07, 0.03, paint)
    for b in range(bays + 1):
        x = b * bp - (bp - cl) / 2
        mb.box(x - 0.07, -0.18, 0, x + 0.07, rows * rp - 0.18, 0.03, paint)
    mb.box(-1, -6.2, 0, bays * bp, -6.0, 0.03, paint_y)
    mb.box(-1, -1.1, 0, bays * bp, -0.9, 0.03, paint_y)
    for r in range(rows):
        for b in range(bays):
            h = rng.choice([0, 1, 2, 3, 3, 4, 4, 4, 4])
            if r == 0:
                h = min(h, 3)
            for k in range(h):
                x0, y0, z0 = b * bp, r * rp, k * ch
                mb.box(x0, y0, z0, x0 + cl, y0 + cw, z0 + ch - 0.03, cont())
    objs = [mb.build('bloque_patio')]

    rtg = MB()
    X, yL, yR, Ht = 60.0, -7.5, rows * rp + 1.5, 18.5
    for y in (yL, yR):
        rtg.box(X - 7, y - 0.8, 0.9, X + 7, y + 0.8, 2.2, YEL)              # viga inferior
        for xw in (X - 6.2, X + 6.2):
            rtg.box(xw - 1, y - 0.7, 0, xw + 1, y + 0.7, 1.4, DARK)         # ruedas
        for xl in (X - 5.5, X + 5.5):
            rtg.box(xl - 0.6, y - 0.6, 2.2, xl + 0.6, y + 0.6, Ht, YEL)     # patas
        rtg.box(X - 6.3, y - 0.7, Ht - 1.3, X + 6.3, y + 0.7, Ht, YEL)
        rtg.beam((X - 5.5, y, 3), (X + 5.5, y, Ht - 1.5), 0.35, 0.35, YEL)
    for xg in (X - 3.5, X + 3.5):
        rtg.box(xg - 0.6, yL - 0.7, Ht, xg + 0.6, yR + 0.7, Ht + 1.5, YEL)  # vigas principales
    rtg.box(X - 3.2, 4, Ht + 1.5, X + 3.2, 9, Ht + 3.3, WHITE)              # carro
    rtg.box(X - 6.5, yR + 0.7, 12, X - 2.5, yR + 3.2, 16, WHITE)            # sala eléctrica
    for xr in (X - 2, X + 2):
        rtg.beam((xr, 6.5, Ht + 1.5), (xr, 6.5, 14.2), 0.1, 0.1, DARK)
    rtg.box(X - 3.03, 5.3, 13.6, X + 3.03, 7.74, 14.2, YEL)                 # spreader
    rtg.box(X - 3.03, 5.3, 11.0, X + 3.03, 7.74, 13.59, CONT[0])
    objs.append(rtg.build('grua_rtg', bevel=0.04))
    return objs


HULL = mat('casco', '#25303B', 0.6, 0.1)
RED = mat('antiincrustante', '#8E2A24', 0.7)
DECK = mat('cubierta', '#6B7178', 0.8)
HATCH = mat('tapas_bodega', '#59606A', 0.8)
OUTLINE = [(0, -15), (2, -16), (165, -16), (180, -14), (190, -10), (197, -5), (200, 0),
           (197, 5), (190, 10), (180, 14), (165, 16), (2, 16), (0, 15)]
BOW = [(165, 16), (180, 14), (190, 10), (197, 5), (200, 0)]


def half_width(x):
    if x <= 165:
        return 16.0
    for (xa, ya), (xb, yb) in zip(BOW, BOW[1:]):
        if xa <= x <= xb:
            return ya + (yb - ya) * (x - xa) / (xb - xa)
    return 0.0


def ship():
    mb = MB()

    def ring(z, t):
        pts = []
        for x, y in OUTLINE:
            xx = x if x <= 165 else 165 + (x - 165) * (1 - 0.3 * t)
            pts.append((max(xx, 3 * t), y * (1 - 0.15 * t), z))
        return pts

    n = len(OUTLINE)
    verts = ring(10, 0) + ring(1, 9 / 21) + ring(-11, 1)
    faces, mats = [], []
    for a in range(n):
        b = (a + 1) % n
        faces += [(a, b, n + b, n + a), (n + a, n + b, 2 * n + b, 2 * n + a)]
        mats += [HULL, RED]
    faces += [tuple(range(n)), tuple(range(2 * n, 3 * n))]
    mats += [DECK, HULL]
    mb.add(verts, faces, mats)

    for i in range(12):
        x0 = 34 + i * 12.8
        x1 = x0 + 12.19
        hw = min(half_width(x0), half_width(x1)) - 0.8
        rows = int((2 * hw) // 2.5)
        if rows < 2:
            continue
        mb.box(x0 - 0.2, -rows * 1.25, 10, x1 + 0.2, rows * 1.25, 10.6, HATCH)
        for r in range(rows):
            y = (r - (rows - 1) / 2) * 2.5
            e = abs(r - (rows - 1) / 2) / ((rows - 1) / 2 + 1e-6)
            tiers = max(1, min(6, int(6.4 - 2.2 * e * e + rng.uniform(-2, 0.4))))
            for t in range(tiers):
                z0 = 10.6 + t * 2.6
                mb.box(x0, y - 1.22, z0, x1, y + 1.22, z0 + 2.59, cont())

    mb.box(8, -11, 10, 22, 11, 33, WHITE)                    # habitación
    mb.box(14, -16.5, 30, 22, 16.5, 34, WHITE)               # puente
    mb.box(21.95, -16.4, 31.4, 22.15, 16.4, 33.1, GLASS)
    mb.box(3, -3, 10, 9, 3, 33, WHITE)                       # chimenea
    mb.box(2.9, -3.1, 33, 9.1, 3.1, 36.5, DARK)
    mb.beam((18, 0, 34), (18, 0, 43), 0.4, 0.4, DARK)        # mástil
    return [mb.build('buque', bevel=0.0)]


def tractor():
    mb = MB()
    mb.box(0, -1.25, 0.8, 2.6, 1.25, 3.6, BLUE)
    mb.box(-0.05, -1.1, 2.4, 0.05, 1.1, 3.3, GLASS)
    mb.box(2.6, -1.2, 0.9, 14.5, 1.2, 1.5, DARK)
    for xw in (1.3, 4.2, 12.4, 13.8):
        mb.box(xw - 0.5, -1.3, 0, xw + 0.5, 1.3, 1.0, DARK)
    mb.box(2.3, -1.22, 1.5, 14.49, 1.22, 4.09, CONT[2])
    return [mb.build('tractor', bevel=0.04)]


def export(objs, fname):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT, fname)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True)
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for o in objs:
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    print(f'MODELO {fname}: {tris} triángulos, {os.path.getsize(path) / 1024:.0f} KB')


export(sts(), 'sts.glb')
export(yard(), 'patio.glb')
export(ship(), 'buque.glb')
export(tractor(), 'tractor.glb')
