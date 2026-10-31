// 敏感性测试：node sensitivity.js
// 把不确定的数值换成不同的取值，看候选方案的排名会不会变
const DATA = require("./data.js");
const { scoreBuild, fmtIns } = require("./calc.js");
const clone = (o) => JSON.parse(JSON.stringify(o));

const gf = ["急速战靴", "末世", "无尽战刃", "破晓", "逐日之弓", "贤者的庇护"];
const pf = ["急速战靴", "末世", "破晓", "无尽战刃", "逐日之弓", "贤者的庇护"];
const cands = {
  "v1 国服顺序+5红月5祸源6狩猎4夺萃": [gf, { 红月: 5, 祸源: 5, 鹰眼: 10, 狩猎: 6, 夺萃: 4 }],
  "v2 国服顺序+2红月8无双6狩猎4夺萃": [gf, { 红月: 2, 无双: 8, 鹰眼: 10, 狩猎: 6, 夺萃: 4 }],
  "v3 国服顺序+10无双7狩猎3夺萃":     [gf, { 无双: 10, 鹰眼: 10, 狩猎: 7, 夺萃: 3 }],
  "v4 破晓提前+10无双7狩猎3夺萃":     [pf, { 无双: 10, 鹰眼: 10, 狩猎: 7, 夺萃: 3 }],
  "v5 破晓提前+2红月8无双6狩猎4夺萃": [pf, { 红月: 2, 无双: 8, 鹰眼: 10, 狩猎: 6, 夺萃: 4 }],
};
const scen = {
  "默认": (d) => d,
  "破晓攻速20%": (d) => { d.items["破晓"].as = 20; return d; },
  "破晓攻速0%": (d) => { d.items["破晓"].as = 0; return d; },
  "只打脆皮": (d) => { d.model.targets = [d.model.targets[0]]; return d; },
  "只打坦克": (d) => { d.model.targets = [d.model.targets[1]]; return d; },
  "被动只有7%": (d) => { d.model.passiveScenarios = [7]; return d; },
  "末世攻速20%": (d) => { d.items["末世"].as = 20; return d; },
  "经济差(500/分)": (d) => { d.model.goldPerMin = 500; return d; },
  "经济好(800/分)": (d) => { d.model.goldPerMin = 800; return d; },
  "只看前中期": (d) => { d.model.timeRange = [3, 12]; return d; },
};
const names = Object.keys(cands);
console.log("场景".padEnd(10), names.map((n) => n.split(" ")[0]).join("   "));
for (const [sn, f] of Object.entries(scen)) {
  const d = f(clone(DATA));
  const sc = names.map((n) => scoreBuild(d, cands[n][0], cands[n][1]).score);
  const b = sc[0];
  const best = sc.indexOf(Math.max(...sc));
  console.log(sn.padEnd(10), sc.map((v, i) => ((v / b) * 100).toFixed(1) + (i === best ? "*" : " ")).join("  "));
}
console.log("\n" + names.map((n) => n).join("\n"));
