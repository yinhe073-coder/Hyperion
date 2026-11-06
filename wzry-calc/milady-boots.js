// 固定疾步之靴，从法术装备池里挑剩下 5 件：node milady-boots.js
const DATA = require("./heroes/milady.js");
const C = require("./calc.js");
const clone = (o) => JSON.parse(JSON.stringify(o));
const pool = Object.keys(DATA.items).filter((n) => !/靴|之足/.test(n));
const ref = C.scoreBuild(DATA, ["冷静之靴", "痛苦面具", "博学者之怒", "日暮之流", "凝冰之息", "辉月"], DATA.defaultIns).score;
const main = C.scoreBuild(DATA, DATA.defaultBuild, DATA.defaultIns).score;
console.log(`基准：推塔冷却流 = 100；默认出装（冷静之靴）= ${(main / ref * 100).toFixed(1)}`);
for (const [cn, patch] of [["默认（附加伤害打塔无效）", {}], ["附加伤害打塔有效", { onHitOnTowers: true }], ["机器人继承攻速", { inheritHeroAS: true }]]) {
  const d = clone(DATA); Object.assign(d.model, patch);
  const r0 = C.scoreBuild(d, ["冷静之靴", "痛苦面具", "博学者之怒", "日暮之流", "凝冰之息", "辉月"], DATA.defaultIns).score;
  const t = Date.now();
  const res = C.optimizeSet(d, ["疾步之靴"], pool, 5, { insStep: 2, top: 5 });
  console.log(`\n## ${cn}（${Date.now() - t} ms）`);
  for (const r of res.slice(0, 4)) {
    const s = C.sumStats(d, { items: r.order, ins: r.ins });
    const m = C.summoner(d, s, 15);
    console.log(`  ${(r.score / r0 * 100).toFixed(1)} | ${r.order.join("→")} | ${C.fmtIns(r.ins)} | 法强 ${m.ap.toFixed(0)} 冷却 ${m.cdr.toFixed(1)}% 拆塔 ${m.towerDps.toFixed(0)} 移速 ${m.moveSpeed.toFixed(0)}`);
  }
}
