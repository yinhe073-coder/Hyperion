// 用王者营地当前装备数据，重算后羿：node houyi-camp.js
const D = require("./heroes/houyi.js");
const C = require("./calc.js");
const v2Ins = { "无双": 10, "鹰眼": 10, "狩猎": 7, "夺萃": 3 };
const builds = {
  "大神主流（末世）":     ["急速战靴", "影刃", "无尽战刃", "仁者破晓", "末世", "贤者的庇护"],
  "大神主流（逐日）":     ["急速战靴", "影刃", "无尽战刃", "仁者破晓", "逐日之弓", "贤者的庇护"],
  "大神（逐日+泣血）":    ["急速战靴", "影刃", "无尽战刃", "逐日之弓", "仁者破晓", "泣血之刃"],
  "我之前的最终版 v2":    ["急速战靴", "末世", "无尽战刃", "仁者破晓", "逐日之弓", "贤者的庇护"],
};
const ref = C.scoreBuild(D, builds["大神主流（末世）"], v2Ins).score;
console.log("== 固定铭文 10无双10鹰眼7狩猎3夺萃，大神主流（末世）= 100");
for (const [n, b] of Object.entries(builds)) {
  const r = C.scoreBuild(D, b, v2Ins); const s = C.sumStats(D, { items: b, ins: v2Ins });
  console.log(`  ${(r.score / ref * 100).toFixed(1)} | ${n.padEnd(12)} | 15级攻速 ${s.as.toFixed(0)}%（上限153.2） 暴击 ${s.critCapped}% 暴伤 ${s.critDmgTotal}% 物攻 ${s.atk} | ${s.price} 金`);
}
const t = Date.now();
const pool = Object.keys(D.items).filter((n) => !/靴|之足/.test(n) && n !== "贤者的庇护");
const res = C.optimizeSet(D, ["急速战靴"], pool, 4, { top: 6, tail: ["贤者的庇护"] });
console.log(`\n== 优化器自选（急速战靴第 1、含贤者的庇护，${Date.now() - t} ms）`);
for (const r of res.slice(0, 5)) {
  const s = C.sumStats(D, { items: r.order, ins: r.ins });
  console.log(`  ${(r.score / ref * 100).toFixed(1)} | ${r.order.join("→")} | ${C.fmtIns(r.ins)} | 攻速 ${s.as.toFixed(0)}% 暴击 ${s.critCapped}% | 成型 ${r.doneAt.join("/")}`);
}
const best = C.optimize(D, builds["大神主流（末世）"]).slice(0, 3);
console.log("\n== 大神主流（末世）这 6 件，优化顺序和铭文");
for (const r of best) console.log(`  ${(r.score / ref * 100).toFixed(1)} | ${r.order.join("→")} | ${C.fmtIns(r.ins)}`);
