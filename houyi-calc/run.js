// 命令行跑一遍候选出装：node houyi-calc/run.js
const DATA = require("./data.js");
const { sumStats, tierOf, solveInscriptions, fmtIns } = require("./calc.js");

const builds = {
  "A 逐日满阈值流": ["急速战靴", "闪电匕首", "无尽战刃", "破晓", "逐日之弓", "名刀·司命"],
  "B 吸血续航流":   ["急速战靴", "闪电匕首", "无尽战刃", "破晓", "泣血之刃", "名刀·司命"],
  "C 末世前期流":   ["急速战靴", "末世", "无尽战刃", "破晓", "逐日之弓", "名刀·司命"],
};
const max = DATA.hero.maxThreshold;

for (const [name, items] of Object.entries(builds)) {
  console.log(`\n=== ${name}: ${items.join(" → ")} ===`);
  const base = sumStats(DATA, { items, ins: {} });
  console.log(`不带铭文：装备 ${base.asItems}% + 成长 ${base.asGrowth}% + 被动满层 ${base.asPassive}% = ${base.as}%（目标 ${max}%）`);
  const best = solveInscriptions(DATA, items).slice(0, 3);
  for (const r of best) {
    const t = tierOf(r.s.as, [max]);
    console.log(`  ${fmtIns(r.ins)} | 攻速 ${r.s.as.toFixed(1)}% ${r.reached ? "✔卡满" : "✘差" + t.gap}` +
      `${t.overflow ? " 溢出" + t.overflow : ""} | 暴击 ${r.s.critCapped.toFixed(1)}% 暴伤 ${r.s.critDmgTotal}%` +
      ` | 吸血 ${r.s.ls}% | 物攻 ${r.s.atk.toFixed(1)} | 价格 ${r.s.price}`);
  }
  // 逐件成型时的攻速（用第一名铭文，15 级、被动满层）
  const ins = best[0].ins;
  const steps = [];
  for (let i = 1; i <= items.length; i++) {
    const s = sumStats(DATA, { items: items.slice(0, i), ins });
    steps.push(`${i}件 ${s.as.toFixed(1)}%`);
  }
  console.log("  成型过程(满级满层)：" + steps.join(" | "));
}

// 推荐方案：用铭文让「4 件套」就卡满 153.2%，第 5、6 件自由选择
const core4 = ["急速战靴", "闪电匕首", "无尽战刃", "破晓"];
console.log(`\n=== D 4件提前卡满：${core4.join(" → ")} ===`);
const d = solveInscriptions(DATA, core4).slice(0, 5);
for (const r of d) {
  const t = tierOf(r.s.as, [max]);
  console.log(`  ${fmtIns(r.ins)} | 攻速 ${r.s.as.toFixed(1)}% ${r.reached ? "✔卡满" : "✘差" + t.gap}${t.overflow ? " 溢出" + t.overflow : ""}` +
    ` | 暴击 ${r.s.critCapped.toFixed(1)}% 暴伤 ${r.s.critDmgTotal}%`);
}
// 不同等级下同一套的攻速（被动满层）
const ins = d[0].ins;
for (const lv of [8, 10, 12, 13, 15]) {
  const s = sumStats(DATA, { items: core4, ins, level: lv });
  console.log(`  ${lv}级 4件 被动满层：${s.as.toFixed(1)}%  | 被动0层：${sumStats(DATA, { items: core4, ins, level: lv, passiveStacks: 0 }).as.toFixed(1)}%`);
}
