// 全局优化：node optimize.js
// 对几套候选 6 件套，各自枚举出装顺序 × 铭文，按「每秒伤害（各阶段加权）」排名
const DATA = require("./data.js");
const { optimize, scoreBuild, fmtIns, rawStats } = require("./calc.js");

const sets = {
  "末世流（国服主流）": ["急速战靴", "末世", "无尽战刃", "破晓", "逐日之弓", "贤者的庇护"],
  "电刀流":             ["急速战靴", "闪电匕首", "无尽战刃", "破晓", "逐日之弓", "贤者的庇护"],
  "影刃流":             ["急速战靴", "影刃", "无尽战刃", "破晓", "逐日之弓", "贤者的庇护"],
  "末世+泣血":          ["急速战靴", "末世", "无尽战刃", "破晓", "泣血之刃", "贤者的庇护"],
};
const finalOrder = sets["末世流（国服主流）"];
const finalIns = { "红月": 5, "祸源": 5, "鹰眼": 10, "狩猎": 6, "夺萃": 4 };
const base = scoreBuild(DATA, finalOrder, finalIns).score;
console.log(`基准（最终版 v1）：${finalOrder.join("→")} | ${fmtIns(finalIns)} | 得分 100`);
const v2Ins = { "红月": 2, "无双": 8, "鹰眼": 10, "狩猎": 6, "夺萃": 4 };
console.log(`优化铭文 v2：${fmtIns(v2Ins)} | 得分 ${(scoreBuild(DATA, finalOrder, v2Ins).score / base * 100).toFixed(1)}`);

const t0 = Date.now();
for (const [name, items] of Object.entries(sets)) {
  const res = optimize(DATA, items);
  console.log(`\n=== ${name} ===  （共 ${res.length} 种组合）`);
  for (const r of res.slice(0, 3)) {
    console.log(`  ${(r.score / base * 100).toFixed(1)} | ${r.order.join("→")} | ${fmtIns(r.ins)}`);
    console.log(`        成型时间（分钟）：${r.doneAt.join(" / ")}`);
  }
}
console.log(`\n耗时 ${Date.now() - t0} ms`);
