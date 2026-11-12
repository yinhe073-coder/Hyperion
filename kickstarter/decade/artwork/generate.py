#!/usr/bin/env python3
"""DECADE 圆形计算尺 —— 生产图稿生成器

运行： python3 generate.py        （依赖：pip install matplotlib ezdxf）
输出（单位全部是毫米，1:1）：
  base-front.svg/.dxf   底盘正面：D 尺 + 换算标记
  base-back.svg/.dxf    底盘背面：使用说明
  top-front.svg/.dxf    转盘正面：C 尺 + 摄氏/华氏对照
  preview.svg           装配效果示意（线稿，不是照片）
  drawing.svg           带尺寸的工程示意图

图层约定：CUT = 切割轮廓（红色细线），MARK = 激光打标区域（黑色填充的闭合轮廓）。
所有文字都已转成轮廓，加工厂不需要安装字体。
改尺寸只改下面「参数」一节，重新运行即可。
"""
import math
from pathlib import Path

import ezdxf
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath

OUT = Path(__file__).parent

# ───────────────────────── 参数（毫米） ─────────────────────────
R_BASE = 26.5          # 底盘半径（Ø53）
R_TOP = 20.0           # 转盘半径（Ø40），C/D 两尺在这条边上相接
R_PIVOT_HOLE = 2.55    # 中心孔半径（Ø5.1，配 Ø5 对锁螺丝筒；按实际选定的螺丝确认）
R_HEAD = 4.5           # 螺丝头半径（Ø9），此范围内不打标
FINGER_R, FINGER_D = 7.7, 4.2   # 拨孔：圆心半径、孔径

GAP = 0.2              # 刻线离转盘边缘的距离（给切割公差和倒角留量）
TICK_LEN = [1.9, 1.5, 1.1, 0.75]      # 四级刻线长度：整数 / 半 / 十分 / 最小
TICK_W = [0.14, 0.11, 0.10, 0.10]     # 对应线宽
NUM_H, SMALL_H, LABEL_H = 1.4, 1.0, 0.95   # 数字、小数字、标注的字高

# 换算标记：转盘的「1」对准它之后，转盘上的数 × 系数 = 底盘上的数
GAUGES = [
    ("nmi▸km", 1.852),
    ("kg▸lb", 2.2046),
    ("in▸cm", 2.54),
    ("oz▸g", 2.835),     # 28.35
    ("m▸ft", 3.2808),
    ("gal▸L", 3.7854),
    ("km▸mi", 6.2137),   # 0.62137
    ("hp▸kW", 7.457),    # 0.7457
]

# 温度对照尺（刻在转盘上，不用转动，直接对读）
T_BASE_R = 12.85                 # 分界圆半径：外侧摄氏，内侧华氏
T_A0, T_A1 = 20.0, 340.0         # 起止角（从正上方顺时针）
T_C0, T_C1 = -40.0, 250.0        # 摄氏量程
# ────────────────────────────────────────────────────────────────

FONT = FontProperties(family="DejaVu Sans")
FONT_B = FontProperties(family="DejaVu Sans", weight="bold")


def ang(v):
    """C/D 尺上数值 v 的角度：一圈正好一个十倍程，1 在正上方，顺时针增大。"""
    return 360.0 * math.log10(v)


def pt(r, a):
    a = math.radians(a)
    return (r * math.sin(a), r * math.cos(a))


class Sheet:
    def __init__(self, name):
        self.name, self.cuts, self.marks = name, [], []   # cuts: (cx,cy,r)  marks: 多边形（可带孔）

    def cut(self, r, cx=0.0, cy=0.0):
        self.cuts.append((cx, cy, r))

    def tick(self, a, r0, r1, w):
        """径向刻线，画成细长矩形，方便打标软件统一填充。"""
        (x0, y0), (x1, y1) = pt(r0, a), pt(r1, a)
        t = math.radians(a)
        nx, ny = math.cos(t) * w / 2, -math.sin(t) * w / 2
        self.marks.append([[(x0 - nx, y0 - ny), (x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny)]])

    def ring(self, r, a0, a1, w, step=1.0):
        """一段圆弧线（宽 w）。"""
        n = max(2, int(abs(a1 - a0) / step) + 1)
        angs = [a0 + (a1 - a0) * i / (n - 1) for i in range(n)]
        self.marks.append([[pt(r + w / 2, a) for a in angs] + [pt(r - w / 2, a) for a in reversed(angs)]])

    def text(self, s, h, r=None, a=None, x=None, y=None, bold=False, rot=None):
        """文字转轮廓。给 (r,a) 时字顶朝外沿半径方向摆放；给 (x,y) 时水平摆放。h 为大写字高。"""
        tp = TextPath((0, 0), s, size=1.0, prop=FONT_B if bold else FONT)
        cap = TextPath((0, 0), "H", size=1.0, prop=FONT_B if bold else FONT).get_extents().height
        k = h / cap
        ext = tp.get_extents()
        cx = (ext.x0 + ext.x1) / 2
        cy = cap / 2                                   # 以大写字高的中线为基准，保证不同字符对齐
        if r is not None:
            ox, oy = pt(r, a)
            t = math.radians(a if rot is None else rot)
        else:
            ox, oy, t = x, y, 0.0
        loops = []
        for poly in tp.to_polygons(closed_only=True):
            loop = []
            for px, py in poly:
                lx, ly = (px - cx) * k, (py - cy) * k
                loop.append((ox + lx * math.cos(t) + ly * math.sin(t), oy - lx * math.sin(t) + ly * math.cos(t)))
            loops.append(loop)
        self.marks.append(loops)
        return (ext.x1 - ext.x0) * k                    # 文字宽度，用于排版检查

    # ---------- 输出 ----------
    def svg_body(self, dx=0.0, dy=0.0, rot=0.0, cut_color="#d00", mark_color="#000"):
        out = [f'<g transform="translate({dx:.3f} {dy:.3f}) rotate({rot:.3f}) scale(1 -1)">']
        for cx, cy, r in self.cuts:
            out.append(f'<circle cx="{cx:.3f}" cy="{cy:.3f}" r="{r:.3f}" fill="none" stroke="{cut_color}" stroke-width="0.05"/>')
        d = []
        for loops in self.marks:
            for loop in loops:
                d.append("M" + "L".join(f"{x:.3f},{y:.3f}" for x, y in loop) + "Z")
        out.append(f'<path d="{"".join(d)}" fill="{mark_color}" fill-rule="evenodd"/>')
        out.append("</g>")
        return "\n".join(out)

    def save(self):
        R = max(r + math.hypot(cx, cy) for cx, cy, r in self.cuts) + 1.0
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{2*R}mm" height="{2*R}mm" '
               f'viewBox="{-R} {-R} {2*R} {2*R}">\n<title>DECADE {self.name}</title>\n{self.svg_body()}\n</svg>\n')
        (OUT / f"{self.name}.svg").write_text(svg)
        doc = ezdxf.new("R2000", setup=False)
        doc.units = ezdxf.units.MM
        doc.layers.add("CUT", color=1)
        doc.layers.add("MARK", color=7)
        msp = doc.modelspace()
        for cx, cy, r in self.cuts:
            msp.add_circle((cx, cy), r, dxfattribs={"layer": "CUT"})
        for loops in self.marks:
            for loop in loops:
                msp.add_lwpolyline(loop, close=True, dxfattribs={"layer": "MARK"})
        doc.saveas(OUT / f"{self.name}.dxf")


def cd_ticks():
    """C/D 尺的全部刻线：返回 (数值, 级别)。用整数运算避免浮点误差造成的重复或遗漏。"""
    out = []
    for k in range(100, 200, 2):          # 1–2：每 0.02 一格
        lvl = 0 if k == 100 else 1 if k % 10 == 0 else 2 if k % 5 == 0 else 3
        if k % 10 == 0 and k != 100 and k % 50 != 0:
            lvl = 1
        out.append((k / 100, lvl))
    for k in range(200, 500, 5):          # 2–5：每 0.05 一格
        lvl = 0 if k % 100 == 0 else 1 if k % 50 == 0 else 2 if k % 10 == 0 else 3
        out.append((k / 100, lvl))
    for k in range(50, 100):              # 5–10：每 0.1 一格
        lvl = 0 if k % 10 == 0 else 1 if k % 5 == 0 else 3
        out.append((k / 10, lvl))
    return out


def scale_cd(sheet, outward):
    """outward=True 画 D 尺（底盘，刻线从接缝向外）；False 画 C 尺（转盘，刻线向内）。"""
    sgn = 1 if outward else -1
    r0 = R_TOP + sgn * GAP
    for v, lvl in cd_ticks():
        w = 0.2 if v == 1 else TICK_W[lvl]              # 起点「1」加粗，一眼能找到
        sheet.tick(ang(v), r0, r0 + sgn * TICK_LEN[lvl], w)
    r_num = r0 + sgn * (TICK_LEN[0] + 0.25 + NUM_H / 2)
    for n in range(1, 10):
        sheet.text(str(n), NUM_H, r=r_num, a=ang(n), bold=True)
    r_small = r0 + sgn * (TICK_LEN[1] + 0.3 + SMALL_H / 2)
    for n in range(1, 10):                              # 1.1 … 1.9 的小数字
        sheet.text(str(n), SMALL_H, r=r_small, a=ang(1 + n / 10))
    return r_num


def build_base_front():
    s = Sheet("base-front")
    s.cut(R_BASE)
    s.cut(R_PIVOT_HOLE)
    r_num = scale_cd(s, outward=True)
    r_gauge_end = r_num + NUM_H / 2 + 0.55
    r_label = r_gauge_end + 0.3 + LABEL_H / 2
    for label, v in GAUGES:
        s.tick(ang(v), R_TOP + GAP, r_gauge_end, 0.10)
        s.text(label, LABEL_H, r=r_label, a=ang(v))
    assert r_label + LABEL_H / 2 < R_BASE - 0.8, "换算标注太靠近边缘"
    return s


def build_top_front():
    s = Sheet("top-front")
    s.cut(R_TOP)
    s.cut(R_PIVOT_HOLE)
    fx, fy = pt(FINGER_R, 0)
    s.cut(FINGER_D / 2, fx, fy)
    r_num = scale_cd(s, outward=False)
    # π 标记
    s.tick(ang(math.pi), R_TOP - GAP, R_TOP - GAP - TICK_LEN[0], 0.10)
    s.text("π", NUM_H * 0.9, r=r_num, a=ang(math.pi))

    # 温度对照尺
    def ta(c):
        return T_A0 + (c - T_C0) / (T_C1 - T_C0) * (T_A1 - T_A0)

    s.ring(T_BASE_R, T_A0, T_A1, 0.10)
    for c in range(int(T_C0), int(T_C1) + 1, 5):        # 摄氏：每 5 度一格，向外
        ln = 1.2 if c % 50 == 0 else 0.9 if c % 10 == 0 else 0.55
        s.tick(ta(c), T_BASE_R, T_BASE_R + ln, 0.10)
    for c in (-40, 0, 50, 100, 150, 200, 250):
        s.text(str(c).replace("-", "−"), LABEL_H, r=T_BASE_R + 1.2 + 0.5 + LABEL_H / 2, a=ta(c))
    f0, f1 = T_C0 * 9 / 5 + 32, T_C1 * 9 / 5 + 32       # −40 … 482 华氏
    for f in range(int(f0), int(f1) + 1, 10):           # 华氏：每 10 度一格，向内
        ln = 1.2 if f % 100 == 0 else 0.9 if f % 50 == 0 else 0.55
        s.tick(ta((f - 32) * 5 / 9), T_BASE_R, T_BASE_R - ln, 0.10)
    for f in (-40, 0, 100, 200, 300, 400):
        s.text(str(f).replace("-", "−"), LABEL_H, r=T_BASE_R - 1.2 - 0.5 - LABEL_H / 2, a=ta((f - 32) * 5 / 9))
    s.text("°C", LABEL_H, r=T_BASE_R + 1.2 + 0.5 + LABEL_H / 2, a=0)
    s.text("°F", LABEL_H, r=T_BASE_R - 1.2 - 0.5 - LABEL_H / 2, a=0)
    # 排版自检
    assert T_BASE_R + 1.2 + 0.5 + LABEL_H < r_num - NUM_H / 2 - 0.2, "摄氏数字与 C 尺数字重叠"
    assert T_BASE_R - 1.2 - 0.5 - LABEL_H > FINGER_R + FINGER_D / 2 + 0.3, "华氏数字与拨孔重叠"
    assert FINGER_R - FINGER_D / 2 > R_HEAD + 1.0, "拨孔离螺丝头太近"
    return s


def build_base_back():
    s = Sheet("base-back")
    s.cut(R_BASE)
    s.cut(R_PIVOT_HOLE)
    lines_top = [
        ("DECADE", 2.2, True),
        ("POCKET SLIDE RULE", 1.05, False),
        ("×   set inner 1 to a  ·  at inner b read outer", 1.05, False),
        ("÷   set inner b to a  ·  at inner 1 read outer", 1.05, False),
    ]
    lines_bot = [
        ("CONVERT   set inner 1 to a mark  ·  inner ⇄ outer", 1.05, False),
        ("%   set inner 1 to 1.20 for +20%", 1.05, False),
        ("°C / °F   read straight across the inner ring", 1.05, False),
        ("No. 0000", 1.05, False),
    ]
    y = 19.5
    for txt, h, b in lines_top:
        w = s.text(txt, h, x=0, y=y, bold=b)
        assert w / 2 < math.sqrt((R_BASE - 1.5) ** 2 - (abs(y) + h) ** 2), f"背面文字超宽：{txt}"
        y -= h + (2.0 if b else 1.7)
    y = -7.5
    for txt, h, b in lines_bot:
        w = s.text(txt, h, x=0, y=y, bold=b)
        assert w / 2 < math.sqrt((R_BASE - 1.5) ** 2 - (abs(y) + h) ** 2), f"背面文字超宽：{txt}"
        y -= h + 1.9
    return s


def preview(base, top, setting):
    """装配示意：转盘的 1 对准底盘的 setting。"""
    R = R_BASE + 3
    rot = ang(setting)
    body = [
        f'<circle r="{R_BASE}" fill="#d9d9d6" stroke="#8a8a86" stroke-width="0.15"/>',
        base.svg_body(cut_color="none", mark_color="#1b1b1b"),
        f'<g transform="rotate({rot:.3f})">',
        f'<circle r="{R_TOP}" fill="#e6e6e3" stroke="#8a8a86" stroke-width="0.15"/>',
        top.svg_body(cut_color="none", mark_color="#1b1b1b"),
        f'<circle cx="0" cy="{-FINGER_R}" r="{FINGER_D/2}" fill="#d9d9d6" stroke="#8a8a86" stroke-width="0.12"/>',
        "</g>",
        f'<circle r="{R_HEAD}" fill="#c9c9c5" stroke="#8a8a86" stroke-width="0.15"/>',
    ]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{2*R*8}" height="{2*R*8}" viewBox="{-R} {-R} {2*R} {2*R}">'
            f'<rect x="{-R}" y="{-R}" width="{2*R}" height="{2*R}" fill="#fff"/>' + "\n".join(body) + "</svg>\n")


def drawing():
    """带尺寸的示意图：正视 + 剖面。"""
    W, H = 190, 95
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W*6}" height="{H*6}" viewBox="0 0 {W} {H}" '
         f'font-family="DejaVu Sans, sans-serif" font-size="2.6"><rect width="{W}" height="{H}" fill="#fff"/>']
    cx, cy = 38, 40
    for r, dash in ((R_BASE, ""), (R_TOP, ""), (R_HEAD, ""), (R_PIVOT_HOLE, "0.8 0.6")):
        o.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#000" stroke-width="0.25" stroke-dasharray="{dash}"/>')
    o.append(f'<circle cx="{cx}" cy="{cy-FINGER_R}" r="{FINGER_D/2}" fill="none" stroke="#000" stroke-width="0.25"/>')
    o.append(f'<path d="M{cx-R_BASE-3} {cy}H{cx+R_BASE+3}M{cx} {cy-R_BASE-3}V{cy+R_BASE+3}" stroke="#888" stroke-width="0.1" stroke-dasharray="3 1 0.5 1"/>')

    def dim(y, half, label):
        o.append(f'<path d="M{cx-half} {y}H{cx+half}M{cx-half} {y-1.2}v2.4M{cx+half} {y-1.2}v2.4" stroke="#06c" stroke-width="0.15" fill="none"/>')
        o.append(f'<text x="{cx}" y="{y-0.8}" text-anchor="middle" fill="#06c">{label}</text>')

    dim(cy + R_BASE + 6, R_BASE, f"Ø{2*R_BASE:g}  底盘")
    dim(cy + R_BASE + 12, R_TOP, f"Ø{2*R_TOP:g}  转盘")
    o.append(f'<text x="{cx+4}" y="{cy-FINGER_R-3}" fill="#06c">拨孔 Ø{FINGER_D:g}，圆心距 {FINGER_R:g}</text>')
    o.append(f'<text x="{cx}" y="6" text-anchor="middle" font-size="3.2">正视图 1:1 示意</text>')
    # 剖面（厚度方向放大 4 倍）
    mx, k, bot_y = 112, 4.0, 46.0                       # 剖面中心 x、厚度放大倍数、底盘下表面 y
    o.append(f'<text x="{mx}" y="6" text-anchor="middle" font-size="3.2">剖面（厚度方向放大 4 倍）</text>')
    parts = [("底盘 1.5", 1.5, R_BASE, "#cfcfcc"), ("PTFE 垫片 0.2", 0.2, 5.0, "#fff3b0"), ("转盘 0.8", 0.8, R_TOP, "#e3e3e0")]
    y, labels = bot_y, []
    for name, t, r, fill in parts:
        y -= t * k
        o.append(f'<rect x="{mx-r}" y="{y}" width="{2*r}" height="{t*k}" fill="{fill}" stroke="#000" stroke-width="0.2"/>')
        labels.append((name, mx + r, y + t * k / 2))
    top_y = y
    o.append(f'<rect x="{mx-2.5}" y="{top_y}" width="5" height="{bot_y-top_y}" fill="#999" stroke="#000" stroke-width="0.2"/>')
    o.append(f'<rect x="{mx-R_HEAD}" y="{top_y-1.0*k}" width="{2*R_HEAD}" height="{1.0*k}" fill="#999" stroke="#000" stroke-width="0.2"/>')
    o.append(f'<rect x="{mx-R_HEAD}" y="{bot_y}" width="{2*R_HEAD}" height="{1.0*k}" fill="#999" stroke="#000" stroke-width="0.2"/>')
    labels.append(("对锁螺丝头 Ø9 × 1.0", mx + R_HEAD, top_y - 0.5 * k))
    labels.append(("背面螺丝头（下垫波形垫圈）", mx + R_HEAD, bot_y + 0.5 * k))
    lx = mx + R_BASE + 6
    for i, (name, ex, ey) in enumerate(sorted(labels, key=lambda t: t[2])):
        ly = 22 + i * 7.5                               # 标注等距排开，用引线连到零件
        o.append(f'<path d="M{ex} {ey}L{lx-1} {ly-0.9}" stroke="#06c" stroke-width="0.12" fill="none"/>')
        o.append(f'<text x="{lx}" y="{ly}" fill="#06c">{name}</text>')
    sx = 78
    notes = ["材料：304 不锈钢（标准版）/ TC4 钛合金（钛版）",
             "表面：喷砂（哑光），正反面光纤激光打标（黑色）",
             "总厚约 4.5 mm；不锈钢版约 37 g，钛版约 21 g（计算值）",
             f"C/D 尺刻度圆周长 {2*math.pi*R_TOP:.1f} mm，相当于一把 {2*math.pi*R_TOP/25.4:.1f} 英寸直尺",
             "打标与外圆同心度 ≤ 0.05 mm；转动力矩 15–40 mN·m（打样时调定）"]
    for i, n in enumerate(notes):
        o.append(f'<text x="{sx}" y="{66+i*4.6}" font-size="2.5">{n}</text>')
    o.append("</svg>\n")
    return "\n".join(o)


def selfcheck():
    """用独立算法复核刻度位置与读数。"""
    assert abs(ang(2) - 108.3708) < 1e-3 and abs(ang(10) - 360) < 1e-9
    vals = [v for v, _ in cd_ticks()]
    assert len(vals) == len(set(vals)) == 50 + 60 + 50
    pitch = min((ang(b) - ang(a)) / 360 * 2 * math.pi * R_TOP for a, b in zip(vals, vals[1:] + [10]))
    assert pitch > 0.5, pitch
    # 换算：转盘 1 对准系数 k 时，转盘读数 c 对着底盘读数 d，应满足 d = c·k（差整数个十倍程）
    for label, k in GAUGES:
        for c in (1.5, 2.0, 7.0):
            a = (ang(c) + ang(k)) % 360                 # 转盘上 c 所在的绝对角度
            d = 10 ** (a / 360)
            ratio = d / (c * k)
            assert min(abs(ratio - 1), abs(ratio - 0.1)) < 1e-9, (label, c, d)
    # 温度：0°C 应对 32°F，100°C 对 212°F
    return pitch


if __name__ == "__main__":
    pitch = selfcheck()
    base, top, back = build_base_front(), build_top_front(), build_base_back()
    for s in (base, top, back):
        s.save()
    (OUT / "preview.svg").write_text(preview(base, top, 2.2046))
    (OUT / "drawing.svg").write_text(drawing())
    vol = lambda r, t: math.pi * r * r * t / 1000        # cm³
    v = vol(R_BASE, 1.5) + vol(R_TOP, 0.8)
    print(f"刻度圆周长 {2*math.pi*R_TOP:.1f} mm，最小刻线间距 {pitch:.2f} mm")
    print(f"两片圆盘重量：不锈钢 {v*7.93:.0f} g，钛 {v*4.43:.0f} g（不含螺丝）")
    print("已生成：", ", ".join(sorted(p.name for p in OUT.iterdir() if p.suffix in (".svg", ".dxf"))))
