// 后羿攻速阈值计算器 —— 计算逻辑（浏览器和 Node 通用）

function sumStats(data, build) {
  // build: { items: [名称...], ins: { 名称: 颗数 }, level, passiveStacks }
  const s = { as: 0, atk: 0, crit: 0, critDmg: 0, ls: 0, ms: 0, pen: 0, penFlat: 0, price: 0, pctCurHP: 0, mBase: 0, mLvl: 0 };
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
  const results = [];
  for (const ins of insCandidates(data)) {
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

// 所有铭文组合：红色、蓝色各最多两种（每色 10 颗），绿色 10 鹰眼
function insCandidates(data) {
  const pairs = (names) => {
    const out = [];
    for (let i = 0; i < names.length; i++)
      for (let j = i; j < names.length; j++)
        for (let a = 0; a <= 10; a++) {
          if (i === j && a !== 10) continue;
          if (i !== j && (a === 0 || a === 10)) continue;
          const o = {};
          o[names[i]] = (i === j) ? 10 : a;
          if (i !== j) o[names[j]] = 10 - a;
          out.push(o);
        }
    return out;
  };
  const out = [];
  for (const r of pairs(Object.keys(data.inscriptions.red)))
    for (const b of pairs(Object.keys(data.inscriptions.blue)))
      out.push(Object.assign({ "鹰眼": 10 }, r, b));
  return out;
}

// ---------------- 每秒伤害模型 ----------------
// 只用于「方案之间比大小」，绝对值不代表游戏内真实数字。
// 每秒伤害 = 每秒普攻次数 × 每次普攻伤害
//   每秒普攻次数 = (1 + 有效攻速) / 基础攻击间隔；有效攻速 = 卡在档位上的攻速（超过上限的部分无效）
//   每次普攻物理伤害 = 物攻 × 暴击期望 + 目标当前生命 × 末世百分比（不暴击）
//   护甲减伤 = 有效护甲 / (有效护甲 + 602)，有效护甲 = 护甲 × (1 - 百分比穿透) - 固定穿透
//   法术伤害（闪电匕首法球）按法抗同公式减免
function effectiveAS(as, thresholds) {
  const t = [...thresholds].sort((a, b) => a - b);
  const max = t[t.length - 1];
  if (t.length === 1) return Math.min(as, max);       // 只知道上限：上限以下按连续处理
  let cur = 0;
  for (const v of t) if (as + 1e-9 >= v) cur = v;      // 有完整档位表：向下取档
  return cur;
}

function hitDamage(data, s, level, target) {
  const h = data.hero;
  const atk = h.baseAtk + h.atkPerLevel * (level - 1) + s.atk;
  const crit = Math.min(s.crit, 100) / 100;
  const critMult = 1 + crit * ((200 + s.critDmg - 100) / 100);
  const k = data.model.armorConst;
  const arm = Math.max(0, target.armor * (1 - s.pen / 100) - s.penFlat);
  const mr = target.mr;
  const phys = atk * critMult + (s.pctCurHP / 100) * target.hp * data.model.avgHpRatio;
  const magic = s.mBase + s.mLvl * level;
  return phys * (k / (k + arm)) + magic * (k / (k + mr));
}

function dps(data, s, level, target, passivePerStack) {
  const h = data.hero;
  const as = s.asRaw + h.growthPerLevel * (level - 1) + passivePerStack * h.passiveStacks;
  const eff = effectiveAS(as, h.thresholds);
  return ((1 + eff / 100) / data.model.baseInterval) * hitDamage(data, s, level, target);
}

// 把装备 + 铭文的属性直接相加（不含等级成长和被动），给优化器用
function rawStats(data, items, ins) {
  const s = sumStats(data, { items, ins, level: 1, passiveStacks: 0 });
  s.asRaw = s.asItems;
  return s;
}

function levelAt(curve, t) {
  for (let i = 1; i < curve.length; i++) {
    const [t0, l0] = curve[i - 1], [t1, l1] = curve[i];
    if (t <= t1) return Math.floor(l0 + (l1 - l0) * (t - t0) / (t1 - t0));
  }
  return curve[curve.length - 1][1];
}
function weightAt(ws, t) {
  let w = ws.length ? ws[0][1] : 1;
  for (const [t0, v] of ws) if (t >= t0) w = v;
  return w;
}

// 一套出装顺序 + 铭文的综合得分（时间轴模型）：
// 按经济推算每个时刻已经买完几件装备（小件的属性忽略，偏保守）、等级多少，
// 每个时刻对每个目标、每种被动假设取平均每秒伤害，再按时间权重对整局取加权平均
function scoreBuild(data, order, ins, opts = {}) {
  const m = Object.assign({}, data.model, opts);
  const cum = [];
  let g = 0;
  for (const n of order) { g += data.items[n].price; cum.push(g); }
  const statsByCount = [rawStats(data, [], ins)];
  for (let i = 1; i <= order.length; i++) statsByCount.push(rawStats(data, order.slice(0, i), ins));
  let total = 0, wsum = 0;
  const stages = new Array(order.length + 1).fill(0), stageN = new Array(order.length + 1).fill(0);
  for (let t = m.timeRange[0]; t <= m.timeRange[1] + 1e-9; t += m.timeStep) {
    const gold = m.startGold + m.goldPerMin * t;
    let k = 0;
    while (k < cum.length && cum[k] <= gold) k++;
    const level = levelAt(m.levelCurve, t);
    const s = statsByCount[k];
    let v = 0, n = 0;
    for (const p of m.passiveScenarios) for (const tg of m.targets) { v += dps(data, s, level, tg, p); n++; }
    v /= n;
    const w = weightAt(m.timeWeights, t);
    total += v * w; wsum += w;
    stages[k] += v; stageN[k]++;
  }
  // stages：每个「已买 k 件」阶段内的平均每秒伤害；doneAt：每件装备成型的分钟
  return {
    score: total / wsum,
    stages: stages.map((v, i) => (stageN[i] ? v / stageN[i] : null)),
    doneAt: cum.map((c) => +((c - m.startGold) / m.goldPerMin).toFixed(1)),
  };
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((x, i) => {
    for (const p of permutations(arr.slice(0, i).concat(arr.slice(i + 1)))) out.push([x, ...p]);
  });
  return out;
}

// 全局优化：给定 6 件装备（鞋固定第 1 件、保命装固定最后），枚举其余装备的顺序 × 所有铭文组合
function optimize(data, items, opts = {}) {
  const def = data.model.defensive;
  const first = items.filter(n => /靴|之足/.test(n));
  const last = items.filter(n => def.includes(n));
  const mid = items.filter(n => !first.includes(n) && !last.includes(n));
  const orders = permutations(mid).map(p => [...first, ...p, ...last]);
  const minLs = opts.minLifesteal ?? data.model.minLifesteal;
  const insList = insCandidates(data).filter(ins => (ins["夺萃"] || 0) >= minLs);
  const res = [];
  for (const order of orders) for (const ins of insList) {
    const r = scoreBuild(data, order, ins, opts);
    res.push({ order, ins, score: r.score, stages: r.stages, doneAt: r.doneAt });
  }
  res.sort((a, b) => b.score - a.score);
  return res;
}

function fmtIns(ins) {
  return Object.entries(ins).map(([k, v]) => v + k).join(" + ");
}

if (typeof module !== "undefined") module.exports = { levelAt, sumStats, tierOf, solveInscriptions, fmtIns, insCandidates, effectiveAS, hitDamage, dps, rawStats, scoreBuild, optimize };
