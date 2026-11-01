// 王者荣耀出装计算器 —— 通用计算逻辑（浏览器和 Node 通用）
//
// 每个英雄一份数据文件（heroes/*.js），数据里的 model.type 决定用哪个计算模型：
//   "adc"      普攻射手：每秒伤害 = 有效攻速 × 普攻伤害（暴击、护甲、穿透、末世、法球）
//   "summoner" 召唤物拆塔：拆塔每秒伤害 = 机器人（吃法术攻击、冷却、友方攻速光环）+ 英雄自身普攻
// 属性累加、阈值判定、铭文枚举、时间轴打分、全局优化对所有英雄通用。

const BASE_KEYS = ["as", "atk", "crit", "critDmg", "ls", "ms", "pen", "penFlat", "price", "pctCurHP",
  "mBase", "mLvl", "ap", "apPct", "cdr", "allyAs", "msFlat", "apOnHit"];

function allInscriptions(data) {
  return Object.assign({}, ...Object.values(data.inscriptions));
}

function sumStats(data, build) {
  // build: { items: [名称...], ins: { 名称: 颗数 }, level, passiveStacks }
  const s = {};
  for (const k of BASE_KEYS) s[k] = 0;
  const add = (o, n = 1) => {
    for (const [k, v] of Object.entries(o)) if (typeof v === "number") s[k] = (s[k] || 0) + v * n;
  };
  for (const name of build.items) {
    const it = data.items[name];
    if (!it) throw new Error("未知装备: " + name);
    add(it);
  }
  const allIns = allInscriptions(data);
  for (const [name, n] of Object.entries(build.ins || {})) {
    if (!allIns[name]) throw new Error("未知铭文: " + name);
    add(allIns[name], n);
  }
  return derive(data, s, build.level, build.passiveStacks);
}

// 由原始属性和等级算出派生属性
function derive(data, s, level, stacks) {
  const h = data.hero;
  level = level ?? h.level;
  stacks = stacks ?? h.passiveStacks ?? 0;
  s.asItems = s.as;
  s.asRaw = s.as;
  s.asGrowth = (h.growthPerLevel || 0) * (level - 1);
  s.asPassive = (h.passivePerStack || 0) * stacks;
  s.as = s.asItems + s.asGrowth + s.asPassive;
  s.critCapped = Math.min(s.crit, 100);
  s.critDmgTotal = 200 + s.critDmg; // 基础暴击伤害 200%
  s.apTotal = s.ap * (1 + s.apPct / 100);
  const cap = h.cdrCap ?? 40;
  s.cdrTotal = Math.min(s.cdr, cap);
  s.cdrOverflow = Math.max(0, s.cdr - cap);
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

// 所有铭文组合：每种颜色最多两种铭文，每色 10 颗
function insCandidates(data, step = 1) {
  const pairs = (names) => {
    const out = [];
    for (let i = 0; i < names.length; i++) {
      out.push({ [names[i]]: 10 });
      for (let j = i + 1; j < names.length; j++)
        for (let a = step; a <= 10 - step; a += step) out.push({ [names[i]]: a, [names[j]]: 10 - a });
    }
    return out;
  };
  let out = [{}];
  for (const group of Object.values(data.inscriptions)) {
    const ps = pairs(Object.keys(group));
    const next = [];
    for (const o of out) for (const p of ps) next.push(Object.assign({}, o, p));
    out = next;
  }
  return out;
}

function meetsInsMin(ins, insMin) {
  for (const [k, v] of Object.entries(insMin || {})) if ((ins[k] || 0) < v) return false;
  return true;
}

// 固定出装，枚举铭文组合（攻速阈值用）：
// 1) 优先卡到目标档位（默认最高档）；2) 暴击期望 / 物攻 / 吸血综合最高
function solveInscriptions(data, items, opts = {}) {
  const thresholds = opts.thresholds || data.hero.thresholds;
  const target = opts.target ?? Math.max(...thresholds);
  const insMin = opts.minLifesteal ? { "夺萃": opts.minLifesteal } : (opts.insMin || {});
  const results = [];
  for (const ins of insCandidates(data)) {
    if (!meetsInsMin(ins, insMin)) continue;
    const s = sumStats(data, { items, ins });
    const tier = tierOf(s.as, thresholds);
    const reached = s.as + 1e-9 >= target;
    // 暴击期望伤害倍率：1 + 暴击率 × (暴击伤害 - 100%)
    const critValue = 1 + (s.critCapped / 100) * ((s.critDmgTotal - 100) / 100);
    results.push({ ins, s, tier, reached, critValue });
  }
  const lsWeight = opts.lsWeight ?? 0.002;
  const score = (r) => r.critValue * (1 + r.s.atk / 1000) * (1 + r.s.apTotal / 2000) + r.s.ls * lsWeight;
  results.sort((x, y) =>
    (y.reached - x.reached) ||
    (x.reached ? 0 : y.s.as - x.s.as) ||
    (score(y) - score(x)) ||
    (x.s.as - y.s.as));
  return results;
}

// ---------------- 模型 1：普攻射手（adc） ----------------
// 只用于「方案之间比大小」，绝对值不代表游戏内真实数字。
//   每秒普攻次数 = (1 + 有效攻速) / 基础攻击间隔；有效攻速 = 卡在档位上的攻速（超过上限的部分无效）
//   每次普攻物理伤害 = 物攻 × 暴击期望 + 目标当前生命 × 末世百分比（不暴击）
//   护甲减伤 = 有效护甲 / (有效护甲 + 602)，有效护甲 = 护甲 × (1 - 百分比穿透) - 固定穿透
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
  const k = data.model.armorConst || 602;
  const arm = Math.max(0, target.armor * (1 - s.pen / 100) - s.penFlat);
  const phys = atk * critMult + (s.pctCurHP / 100) * target.hp * (data.model.avgHpRatio ?? 0.6);
  const magic = s.mBase + s.mLvl * level;
  return phys * (k / (k + arm)) + magic * (k / (k + target.mr));
}

function dps(data, s, level, target, passivePerStack) {
  const h = data.hero;
  const as = s.asRaw + (h.growthPerLevel || 0) * (level - 1) + passivePerStack * (h.passiveStacks || 0);
  const eff = effectiveAS(as, h.thresholds);
  return ((1 + eff / 100) / data.model.baseInterval) * hitDamage(data, s, level, target);
}

// ---------------- 模型 2：召唤物拆塔（summoner，米莱狄） ----------------
//   法术攻击 = 法术攻击 × (1 + 法术攻击加成%)
//   场上平均机器人数 = min(上限, 每次召唤个数 × 存在时间 ÷ (召唤冷却 × (1 - 冷却缩减)))
//   二技能覆盖率 = min(1, 持续时间 ÷ (二技能冷却 × (1 - 冷却缩减)))
//   机器人攻速加成 = 覆盖率 × 二技能攻速 + 友方攻速光环 + (继承自身攻速 ? 自身攻速 : 0)
//   机器人每次攻击 = (基础攻击 + 成长 + 法强系数 × 法术攻击) × (1 + 合体加成)
//   英雄普攻 = 自身攻击 + 法强系数 × 法术攻击 + (附加伤害对塔有效 ? 法球 + 圣剑 : 0)
//   得分 = 拆塔每秒伤害 × (1 + 移速权重 × 移速加成%)
function summoner(data, s, level) {
  const h = data.hero, m = data.model, r = m.robot;
  const ap = s.ap * (1 + s.apPct / 100);
  const cdr = Math.min(s.cdr, h.cdrCap ?? 40) / 100;
  const heroAS = s.asRaw + (h.growthPerLevel || 0) * (level - 1);
  const robots = Math.min(r.cap, (r.perCast * r.lifetime) / (r.skillCd * (1 - cdr)));
  const ultUp = Math.min(1, m.ult.duration / (m.ult.cd * (1 - cdr)));
  const robotAS = ultUp * m.ult.asBonus + s.allyAs + (Number(m.inheritHeroAS) ? heroAS : 0);
  const robotHit = (r.baseAtk + r.atkPerLevel * (level - 1) + r.apRatio * ap) * (1 + r.mergeBonus);
  const robotDps = robots * robotHit * r.baseAps * (1 + robotAS / 100);
  const heroAps = (1 + effectiveAS(heroAS, h.thresholds) / 100) / m.baseInterval;
  const onHit = Number(m.onHitOnTowers) ? s.mBase + s.mLvl * level + s.apOnHit * ap : 0;
  const heroDps = heroAps * (h.baseAtk + h.atkPerLevel * (level - 1) + h.heroApRatio * ap + onHit);
  const msPct = s.ms + (s.msFlat / h.baseMs) * 100;
  const towerDps = robotDps + heroDps;
  return {
    value: towerDps * (1 + (m.msValue || 0) * msPct / 100),
    towerDps, robotDps, heroDps, robots, robotAS, ultUp, ap, cdr: cdr * 100, msPct,
    moveSpeed: (h.baseMs + s.msFlat) * (1 + s.ms / 100),
  };
}

// 按模型类型求值（越大越好）
function evaluate(data, s, level, target, sc = {}) {
  if (data.model.type === "summoner") return summoner(data, s, level).value;
  return dps(data, s, level, target, sc.passive ?? data.hero.passivePerStack);
}

function scenariosOf(m) {
  if (m.scenarios) return m.scenarios;
  if (m.passiveScenarios) return m.passiveScenarios.map((p) => ({ passive: p }));
  return [{}];
}

// 把装备 + 铭文的属性直接相加（不含等级成长和被动）
function rawStats(data, items, ins) {
  return sumStats(data, { items, ins, level: 1, passiveStacks: 0 });
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
// 每个时刻对每个目标、每种假设取平均，再按时间权重对整局取加权平均
function scoreBuild(data, order, ins, opts = {}) {
  const statsByCount = [];
  for (let i = 0; i <= order.length; i++) statsByCount.push(rawStats(data, order.slice(0, i), ins));
  return scoreFromStats(data, order, statsByCount, opts);
}

function scoreFromStats(data, order, statsByCount, opts = {}) {
  const m = Object.assign({}, data.model, opts);
  const cum = [];
  let g = 0;
  for (const n of order) { g += data.items[n].price; cum.push(g); }
  const scen = scenariosOf(m);
  let total = 0, wsum = 0;
  for (let t = m.timeRange[0]; t <= m.timeRange[1] + 1e-9; t += m.timeStep) {
    const gold = m.startGold + m.goldPerMin * t;
    let k = 0;
    while (k < cum.length && cum[k] <= gold) k++;
    const level = levelAt(m.levelCurve, t);
    const s = statsByCount[k];
    let v = 0, n = 0;
    for (const sc of scen) for (const tg of m.targets) { v += evaluate(data, s, level, tg, sc); n++; }
    const w = weightAt(m.timeWeights, t);
    total += (v / n) * w; wsum += w;
  }
  return {
    score: total / wsum,
    doneAt: cum.map((c) => +((c - m.startGold) / m.goldPerMin).toFixed(1)),
  };
}

// 只做属性相加（不求派生属性），给优化器缓存用
function addRaw(dst, o, n = 1) {
  for (const k in o) if (typeof o[k] === "number") dst[k] = (dst[k] || 0) + o[k] * n;
  return dst;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((x, i) => {
    for (const p of permutations(arr.slice(0, i).concat(arr.slice(i + 1)))) out.push([x, ...p]);
  });
  return out;
}

// 全局优化：给定装备（鞋固定第 1 件、保命装固定最后），枚举其余装备的顺序 × 所有铭文组合
function optimize(data, items, opts = {}) {
  const def = data.model.defensive || [];
  const first = items.filter((n) => /靴|之足/.test(n));
  const last = items.filter((n) => def.includes(n));
  const mid = items.filter((n) => !first.includes(n) && !last.includes(n));
  const orders = permutations(mid).map((p) => [...first, ...p, ...last]);
  const insMin = opts.minLifesteal !== undefined
    ? { "夺萃": opts.minLifesteal }
    : (opts.insMin || data.model.insMin || {});
  const insList = insCandidates(data, opts.insStep || 1).filter((ins) => meetsInsMin(ins, insMin));
  // 缓存：每套铭文的属性和、每个出装前缀的属性和各算一次，组合时直接相加
  const allIns = allInscriptions(data);
  const insRaw = insList.map((ins) => {
    const o = {};
    for (const [k, n] of Object.entries(ins)) addRaw(o, allIns[k], n);
    return o;
  });
  const prefixCache = new Map();
  const prefixRaw = (items) => {
    const key = items.join("|");
    if (!prefixCache.has(key)) {
      const o = {};
      for (const k of BASE_KEYS) o[k] = 0;
      for (const n of items) addRaw(o, data.items[n]);
      prefixCache.set(key, o);
    }
    return prefixCache.get(key);
  };
  const res = [];
  for (const order of orders) {
    const prefixes = [];
    for (let i = 0; i <= order.length; i++) prefixes.push(prefixRaw(order.slice(0, i)));
    insList.forEach((ins, j) => {
      const statsByCount = prefixes.map((p) => derive(data, addRaw(addRaw({}, p), insRaw[j]), 1, 0));
      const r = scoreFromStats(data, order, statsByCount, opts.model || {});
      res.push({ order, ins, score: r.score, doneAt: r.doneAt });
    });
  }
  res.sort((a, b) => b.score - a.score);
  return res;
}

function fmtIns(ins) {
  return Object.entries(ins).map(([k, v]) => v + k).join(" + ");
}

// 读写 "robot.apRatio" 这类带点的路径
function getPath(o, p) { return p.split(".").reduce((x, k) => (x == null ? x : x[k]), o); }
function setPath(o, p, v) {
  const ks = p.split("."); const last = ks.pop();
  ks.reduce((x, k) => x[k], o)[last] = v;
}

if (typeof module !== "undefined") module.exports = {
  sumStats, derive, tierOf, solveInscriptions, fmtIns, insCandidates, effectiveAS, hitDamage, dps,
  summoner, evaluate, rawStats, scoreBuild, scoreFromStats, optimize, levelAt, getPath, setPath,
};
