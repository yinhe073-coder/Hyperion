// 米莱狄方案对比：node milady-compare.js
// 几套候选出装在「机器人是否继承攻速 × 附加伤害是否对塔有效」四种假设下的得分
const DATA = require("./heroes/milady.js");
const { sumStats, summoner, optimize, scoreBuild, fmtIns } = require("./calc.js");
const clone = (o) => JSON.parse(JSON.stringify(o));

const builds = {
  "冷却拆塔流":       ["冷静之靴", "痛苦面具", "博学者之怒", "日暮之流", "凝冰之息", "辉月"],
  "纯推塔（圣贤书）": ["冷静之靴", "痛苦面具", "博学者之怒", "日暮之流", "贤者天书", "辉月"],
  "圣剑电刀疾步流":   ["疾步之靴", "金色圣剑", "闪电匕首", "博学者之怒", "凝冰之息", "辉月"],
  "回响推塔流":       ["冷静之靴", "痛苦面具", "博学者之怒", "回响之杖", "日暮之流", "辉月"],
  "疾步+冷却折中":    ["疾步之靴", "痛苦面具", "博学者之怒", "日暮之流", "金色圣剑", "辉月"],
};
const ins = DATA.defaultIns;
const cases = [
  ["默认：不继承攻速、附加伤害打塔无效", {}],
  ["机器人继承自身攻速", { inheritHeroAS: true }],
  ["附加伤害对塔有效", { onHitOnTowers: true }],
  ["两者都成立", { inheritHeroAS: true, onHitOnTowers: true }],
  ["只看拆塔（不算移速）", { msValue: 0 }],
];
const names = Object.keys(builds);
for (const [cn, patch] of cases) {
  const d = clone(DATA); Object.assign(d.model, patch);
  const sc = names.map((n) => scoreBuild(d, builds[n], ins).score);
  const base = sc[0], best = sc.indexOf(Math.max(...sc));
  console.log(`\n${cn}`);
  names.forEach((n, i) => console.log(`  ${(sc[i] / base * 100).toFixed(1).padStart(6)}${i === best ? " ★" : "  "} ${n}`));
}

// 15 级成型面板
console.log("\n15 级成型面板（默认假设）：");
for (const n of names) {
  const s = sumStats(DATA, { items: builds[n], ins });
  const r = summoner(DATA, s, 15);
  console.log(`  ${n.padEnd(10)} 法强 ${r.ap.toFixed(0)} | 冷却 ${r.cdr.toFixed(0)}%${s.cdrOverflow ? `(溢出${s.cdrOverflow})` : ""} | 机器人 ${r.robots.toFixed(2)} 个 攻速+${r.robotAS.toFixed(0)}% | 拆塔/秒 ${r.towerDps.toFixed(0)}（机器人 ${r.robotDps.toFixed(0)} + 自己 ${r.heroDps.toFixed(0)}） | 移速 ${r.moveSpeed.toFixed(0)}`);
}

// 全局优化：默认假设下，冷却拆塔流的最优顺序和铭文
const t0 = Date.now();
const res = optimize(DATA, builds["冷却拆塔流"]);
const b = scoreBuild(DATA, builds["冷却拆塔流"], ins).score;
console.log(`\n全局优化（冷却拆塔流，${res.length} 种组合，${Date.now() - t0} ms）：`);
for (const r of res.slice(0, 3)) console.log(`  ${(r.score / b * 100).toFixed(1)} | ${r.order.join("→")} | ${fmtIns(r.ins)}`);
