// 米莱狄「前期打人」优化：node milady-pvp.js
// 只看第 3～12 分钟，拆塔和打人几何加权（各 50%），冷静之靴固定第 1 件，从装备池挑 5 件
const DATA = require("./heroes/milady.js");
const C = require("./calc.js");
const clone = (o) => JSON.parse(JSON.stringify(o));
const pool = Object.keys(DATA.items).filter((n) => !/靴|之足/.test(n));

function earlyProfile(d, order, ins) {
  // 第 5 / 8 / 11 分钟时的面板（按经济推算买了几件）
  const m = d.model, out = [];
  let g = 0; const cum = order.map((n) => (g += d.items[n].price));
  for (const t of [5, 8, 11]) {
    const k = cum.filter((c) => c <= m.goldPerMin * t).length;
    const s = C.sumStats(d, { items: order.slice(0, k), ins, level: C.levelAt(m.levelCurve, t) });
    const r = C.summoner(d, s, C.levelAt(m.levelCurve, t));
    out.push(`${t}分(${k}件) 打人${r.pvpDps.toFixed(0)}/拆塔${r.towerDps.toFixed(0)}`);
  }
  return out.join(" | ");
}

for (const w of [0.5, 0.7]) {
  const d = clone(DATA);
  d.model.pvp.weight = w; d.model.timeRange = [3, 12];
  const base = C.scoreBuild(d, DATA.defaultBuild, DATA.defaultIns).score;
  console.log(`\n## 打人权重 ${w}，只看 3～12 分钟（主推极影流 = 100）`);
  console.log(`  主推：${DATA.defaultBuild.join("→")} | ${C.fmtIns(DATA.defaultIns)}`);
  console.log(`        ${earlyProfile(d, DATA.defaultBuild, DATA.defaultIns)}`);
  const t = Date.now();
  const res = C.optimizeSet(d, ["冷静之靴"], pool, 5, { insStep: 2, top: 5 });
  for (const r of res.slice(0, 3)) {
    console.log(`  ${(r.score / base * 100).toFixed(1)} | ${r.order.join("→")} | ${C.fmtIns(r.ins)}`);
    console.log(`        ${earlyProfile(d, r.order, r.ins)}`);
  }
  // 整局（3～20 分钟）表现，看前期优化有没有牺牲后期
  const d2 = clone(DATA); d2.model.pvp.weight = w;
  const full0 = C.scoreBuild(d2, DATA.defaultBuild, DATA.defaultIns).score;
  const full1 = C.scoreBuild(d2, res[0].order, res[0].ins).score;
  const tower0 = C.scoreBuild(clone(DATA), DATA.defaultBuild, DATA.defaultIns).score;
  const tower1 = C.scoreBuild(clone(DATA), res[0].order, res[0].ins).score;
  console.log(`  第一名整局（3～20分）综合 ${(full1 / full0 * 100).toFixed(1)}，纯拆塔 ${(tower1 / tower0 * 100).toFixed(1)}（${Date.now() - t} ms）`);
}
