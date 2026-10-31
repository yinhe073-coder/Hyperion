// 后羿攻速阈值计算器 —— 计算逻辑（浏览器和 Node 通用）

function sumStats(data, build) {
  // build: { items: [名称...], ins: { 名称: 颗数 }, level, passiveStacks }
  const s = { as: 0, atk: 0, crit: 0, critDmg: 0, ls: 0, ms: 0, pen: 0, penFlat: 0, price: 0 };
  const add = (o, n = 1) => {
    for (const k of Object.keys(s)) if (typeof o[k] === "number") s[k] += o[k] * n;
  };
  for (const name of build.items) {
    const it = data.items[name];
    if (!it) throw new Error("未知装备: " + name);
    add(it);
  }
  const allIns = Object.assign({}, data.inscriptions.red, data.inscriptions.blue, data.inscriptions.green);
  for (const [name, n] of Object.entries(build.ins || {})) {
    if (!allIns[name]) throw new Error("未知铭文: " + name);
    add(allIns[name], n);
  }
  const h = data.hero;
  const level = build.level ?? h.level;
  const stacks = build.passiveStacks ?? h.passiveStacks;
  s.asItems = s.as;
  s.asGrowth = h.growthPerLevel * (level - 1);
  s.asPassive = h.passivePerStack * stacks;
  s.as = s.asItems + s.asGrowth + s.asPassive;
  s.critCapped = Math.min(s.crit, 100);
  s.critDmgTotal = 200 + s.critDmg; // 基础暴击伤害 200%
  return s;
}

// 给定攻速，算出落在哪一档、浪费多少、离下一档差多少
function tierOf(as, thresholds) {
  const t = [...thresholds].sort((a, b) => a - b);
  const max = t[t.length - 1];
  let cur = 0, next = null;
  for (const v of t) {
    if (as + 1e-9 >= v) cur = v;
    else { next = v; break; }
  }
  return {
    tier: cur,
    waste: +(as - cur).toFixed(2),
    next,
    gap: next === null ? 0 : +(next - as).toFixed(2),
    capped: as + 1e-9 >= max,
    overflow: as > max ? +(as - max).toFixed(2) : 0,
  };
}

// 固定出装，枚举铭文组合：
// 1) 优先卡到目标档位（默认最高档）；2) 攻速浪费最少；3) 暴击期望收益最高；4) 吸血其次
function solveInscriptions(data, items, opts = {}) {
  const thresholds = opts.thresholds || data.hero.thresholds;
  const target = opts.target ?? Math.max(...thresholds);
  const red = Object.keys(data.inscriptions.red);
  const blue = Object.keys(data.inscriptions.blue);
  const results = [];
  const pairs = (names) => {
    const out = [];
    for (let i = 0; i < names.length; i++)
      for (let j = i; j < names.length; j++)
        for (let a = 0; a <= 10; a++) {
          if (i === j && a !== 10) continue;
          const o = {};
          if (a) o[names[i]] = a;
          if (10 - a) o[names[j]] = (o[names[j]] || 0) + 10 - a;
          out.push(o);
        }
    return out;
  };
  const seen = new Set();
  for (const r of pairs(red)) for (const b of pairs(blue)) {
    const ins = Object.assign({ "鹰眼": 10 }, r, b);
    const key = JSON.stringify(Object.entries(ins).sort());
    if (seen.has(key)) continue;
    seen.add(key);
    if (opts.minLifesteal && (ins["夺萃"] || 0) < opts.minLifesteal) continue;
    const s = sumStats(data, { items, ins });
    const tier = tierOf(s.as, thresholds);
    const reached = s.as + 1e-9 >= target;
    // 暴击期望伤害倍率：1 + 暴击率 × (暴击伤害 - 100%)
    const critValue = 1 + (s.critCapped / 100) * ((s.critDmgTotal - 100) / 100);
    results.push({ ins, s, tier, reached, critValue });
  }
  const lsWeight = opts.lsWeight ?? 0.002; // 1% 吸血约等于 0.2% 输出期望的偏好权重，可调
  const score = (r) => r.critValue * (1 + r.s.atk / 1000) + r.s.ls * lsWeight;
  results.sort((x, y) =>
    (y.reached - x.reached) ||
    (x.reached ? 0 : y.s.as - x.s.as) ||
    (score(y) - score(x)) ||
    (x.s.as - y.s.as));
  return results;
}

function fmtIns(ins) {
  return Object.entries(ins).map(([k, v]) => v + k).join(" + ");
}

if (typeof module !== "undefined") module.exports = { sumStats, tierOf, solveInscriptions, fmtIns };
