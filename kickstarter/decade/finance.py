#!/usr/bin/env python3
"""DECADE 众筹财务模型。改下面的假设后运行 python3 finance.py，输出 Markdown 表格。
所有成本都是估算，标了「待报价」的必须以工厂和物流商的实际报价替换。"""

FX = 7.1                      # 人民币/美元，假设值

# ── 单件成本（人民币，500–1000 件批量，待报价）──
COST = {
    "ss": dict(blanks=5.0, finish=2.5, marking=4.5, hardware=1.8, assembly=1.5, packaging=4.0),
    "ti": dict(blanks=16.0, finish=3.0, marking=4.5, hardware=1.8, assembly=1.5, packaging=4.0),
}
SCRAP = 0.08                  # 报废与返工
SLEEVE_COST = 8.0             # 皮套（加购）

# ── 档位：价格（美元）、每单含几件不锈钢/钛 ──
TIERS = {
    "不锈钢 早鸟":   dict(price=29, ss=1, ti=0),
    "不锈钢":        dict(price=35, ss=1, ti=0),
    "钛 早鸟":       dict(price=49, ss=0, ti=1),
    "钛":            dict(price=59, ss=0, ti=1),
    "一对（钢+钛）": dict(price=79, ss=1, ti=1),
    "礼物装 4 枚钢": dict(price=115, ss=4, ti=0),
}
EARLY_LIMIT = {"不锈钢 早鸟": 300, "钛 早鸟": 200}
MIX = {"ss": 0.55, "ti": 0.30, "pair": 0.10, "gift": 0.05}   # 支持者选择各档的比例（假设）
SLEEVE_RATE, SLEEVE_PRICE = 0.25, 9                          # 四分之一的人加购皮套

# ── 运费：向支持者收取 / 实际成本（美元，含美国关税的到门价，待报价）──
REGION = {  # 占比, 收取, 成本
    "美国":     (0.55, 7, 7.0),
    "欧盟/英国": (0.25, 8, 6.0),     # 增值税在众筹后的问卷里另收，不计入
    "其他":     (0.20, 10, 7.0),
}

# ── 平台与支付 ──
KS_FEE, PAY_FEE, PAY_FIXED, DROPPED = 0.05, 0.03, 0.20, 0.03

# ── 固定投入（人民币）──
FIXED = {
    "三轮打样（切割+打标+螺丝，各版本）": 3000,
    "照片与视频（自拍+灯具道具，或请人）": 6000,
    "香港公司注册、银行开户与首年维护（待报价）": 8000,
    "打标定位治具、检具": 800,
    "寄给测评人的样品与运费": 1500,
    "预热期广告（可选，约 1000 美元）": 7100,
}


def unit_cost(kind):
    return sum(COST[kind].values()) * (1 + SCRAP)


def scenario(backers):
    n = {k: backers * v for k, v in MIX.items()}
    orders = {}
    eb = min(n["ss"], EARLY_LIMIT["不锈钢 早鸟"]); orders["不锈钢 早鸟"] = eb; orders["不锈钢"] = n["ss"] - eb
    eb = min(n["ti"], EARLY_LIMIT["钛 早鸟"]); orders["钛 早鸟"] = eb; orders["钛"] = n["ti"] - eb
    orders["一对（钢+钛）"] = n["pair"]; orders["礼物装 4 枚钢"] = n["gift"]
    pledged = sum(TIERS[t]["price"] * q for t, q in orders.items())
    sleeves = backers * SLEEVE_RATE
    pledged += sleeves * SLEEVE_PRICE
    ship_in = sum(backers * share * charge for share, charge, _ in REGION.values())
    ship_out = sum(backers * share * cost for share, _, cost in REGION.values())
    gross = pledged + ship_in                       # Kickstarter 上显示的筹款额
    collected = gross * (1 - DROPPED)
    fees = collected * (KS_FEE + PAY_FEE) + backers * (1 - DROPPED) * PAY_FIXED
    units_ss = sum(TIERS[t]["ss"] * q for t, q in orders.items())
    units_ti = sum(TIERS[t]["ti"] * q for t, q in orders.items())
    cogs = (units_ss * unit_cost("ss") + units_ti * unit_cost("ti") + sleeves * SLEEVE_COST) / FX
    fixed = sum(FIXED.values()) / FX
    net = collected - fees - cogs - ship_out * (1 - DROPPED) - fixed
    return dict(backers=backers, gross=gross, fees=fees, cogs=cogs, ship=ship_out, fixed=fixed, net=net,
                units=units_ss + units_ti)


if __name__ == "__main__":
    print(f"单件成本：不锈钢 ¥{unit_cost('ss'):.1f}（${unit_cost('ss')/FX:.2f}），钛 ¥{unit_cost('ti'):.1f}（${unit_cost('ti')/FX:.2f}）")
    print(f"固定投入合计：¥{sum(FIXED.values()):,}（${sum(FIXED.values())/FX:,.0f}）\n")
    print("| 支持者 | 筹款额 | 件数 | 平台+支付费 | 生产成本 | 运费成本 | 固定投入 | 净结余 | 折人民币 |")
    print("|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for b in (100, 160, 300, 600, 1200, 2500):
        s = scenario(b)
        print(f"| {b} | ${s['gross']:,.0f} | {s['units']:.0f} | ${s['fees']:,.0f} | ${s['cogs']:,.0f} | ${s['ship']:,.0f} | ${s['fixed']:,.0f} | ${s['net']:,.0f} | ¥{s['net']*FX:,.0f} |")
    # 盈亏平衡
    lo, hi = 1, 5000
    while hi - lo > 1:
        mid = (lo + hi) // 2
        lo, hi = (lo, mid) if scenario(mid)["net"] >= 0 else (mid, hi)
    s = scenario(hi)
    print(f"\n盈亏平衡：约 {hi} 位支持者，筹款额约 ${s['gross']:,.0f}")
