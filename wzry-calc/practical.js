// 实际可行的最强出装：node practical.js [英雄]
// 候选出装全部取自王者营地大神榜（data/camp-ranklist-2026-11-06.json）+ 少量多卡阈值的变体；
// 第 1 件固定鞋子（打野：打野刀 → 鞋子），铭文整局一套。
// 评选：① 后期卡住的阈值最多 ② 再看「4 级强度 × 后期强度」的几何平均
const M = require("./early-late.js");
const { HEROES, total, powerOf, recipe, planPurchaseInner, fmtIns, insCandidates, INS } = M;
const DB = require("./data/camp-equip-2026-11-06.json");
const price = Object.fromEntries(DB.map((e) => [e.name, e.money]));

const PLANS = {
  "后羿": { hero: "后羿", prefix: ["急速战靴"], builds: {
    "大神主流·末世": ["急速战靴", "影刃", "无尽战刃", "仁者破晓", "末世", "贤者的庇护"],
    "大神·逐日": ["急速战靴", "影刃", "无尽战刃", "仁者破晓", "逐日之弓", "贤者的庇护"],
    "大神·末世+名刀": ["急速战靴", "影刃", "无尽战刃", "仁者破晓", "末世", "名刀·司命"],
    "卡暴击·幽影": ["急速战靴", "影刃", "无尽战刃", "仁者破晓", "逐日之弓", "幽影袖箭"],
    "输出·破军": ["急速战靴", "影刃", "无尽战刃", "仁者破晓", "末世", "强者破军"],
  } },
  "孙悟空": { hero: "孙悟空", prefix: ["追击刀锋", "急速战靴"], builds: {
    "大神·战斧": ["贪婪之噬", "急速战靴", "无尽战刃", "影刃", "暗影战斧", "名刀·司命"],
    "大神·末世": ["贪婪之噬", "急速战靴", "无尽战刃", "影刃", "末世", "名刀·司命"],
    "大神·宗师破军": ["贪婪之噬", "急速战靴", "无尽战刃", "影刃", "宗师之力", "强者破军"],
    "大神·碎星锤": ["贪婪之噬", "急速战靴", "无尽战刃", "影刃", "碎星锤", "贤者的庇护"],
    "卡攻速·制裁": ["贪婪之噬", "急速战靴", "无尽战刃", "影刃", "末世", "制裁之刃"],
  } },
  "米莱狄·打野": { hero: "米莱狄·打野", prefix: ["游击弯刀", "冷静之靴"], builds: {
    "推塔冷却": ["符文大剑", "冷静之靴", "日暮之流", "博学者之怒", "贤者天书", "虚无法杖"],
    "回响爆发": ["符文大剑", "冷静之靴", "回响之杖", "博学者之怒", "贤者天书", "虚无法杖"],
    "凝冰控制": ["符文大剑", "冷静之靴", "凝冰之息", "日暮之流", "博学者之怒", "贤者天书"],
    "大神思路·梦魇": ["符文大剑", "冷静之靴", "梦魇之牙", "痛苦面具", "日暮之流", "博学者之怒"],
  } },
  "米莱狄·对抗路": { hero: "米莱狄·对抗路", prefix: ["冷静之靴"], builds: {
    "大神·梦魇面具": ["冷静之靴", "梦魇之牙", "痛苦面具", "日暮之流", "凝冰之息", "博学者之怒"],
    "大神·回响虚无": ["冷静之靴", "回响之杖", "痛苦面具", "博学者之怒", "虚无法杖", "辉月"],
    "卡冷却·天书": ["冷静之靴", "日暮之流", "博学者之怒", "贤者天书", "回响之杖", "虚无法杖"],
    "大神·天书": ["冷静之靴", "梦魇之牙", "痛苦面具", "日暮之流", "贤者天书", "博学者之怒"],
  } },
  "廉颇": { hero: "廉颇", prefix: ["冷静之靴"], builds: {
    "大神·血魔极寒（胜率 66%）": ["冷静之靴", "红莲斗篷", "血魔之怒", "极寒风暴", "不死鸟之眼", "霸者重装"],
    "大神·怒龙冰霜": ["冷静之靴", "红莲斗篷", "怒龙剑盾", "冰霜冲击", "魔女斗篷", "不祥征兆"],
    "大神·怒龙血魔": ["冷静之靴", "红莲斗篷", "怒龙剑盾", "血魔之怒", "极寒风暴", "霸者重装"],
    "影忍·反甲": ["影忍之足", "红莲斗篷", "怒龙剑盾", "反伤刺甲", "魔女斗篷", "霸者重装"],
    "大神·血魔贤者": ["冷静之靴", "红莲斗篷", "血魔之怒", "极寒风暴", "霸者重装", "贤者的庇护"],
  } },
};

// 固定前缀（鞋 / 打野刀）按配方顺序买齐，其余交给购买顺序模拟
function purchase(H, build, prefix, ins) {
  const steps = []; let gold = 0; const bag = [];
  const take = (b, n) => { const i = b.indexOf(n); if (i >= 0) { b.splice(i, 1); return true; } return false; };
  for (const p of prefix) {
    const seq = []; const walk = (n) => { recipe(n).forEach(walk); seq.push(n); }; walk(p);
    for (const n of seq) {
      const kids = recipe(n), cost = price[n] - kids.reduce((a, k) => a + price[k], 0);
      kids.forEach((k) => take(bag, k)); bag.push(n); gold += cost;
      steps.push({ buy: n, cost, gold, bag: bag.slice(), merged: kids.length > 0 });
    }
  }
  const rest = build.filter((n) => !prefix.includes(n));
  const score = (b) => powerOf(H, total(H, b, ins, 8), H.target4);
  return steps.concat(planPurchaseInner(H, rest, score, bag, gold));
}
const bagAt = (steps, budget) => { let b = []; for (const s of steps) if (s.gold <= budget) b = s.bag; return b; };

function evaluate(name) {
  const P = PLANS[name], H = HEROES[P.hero];
  const insList = insCandidates(INS[H.insType], 1);
  const rows = [];
  for (const [bn, build] of Object.entries(P.builds)) {
    // 先用该英雄默认铭文排购买顺序，挑完铭文后再用新铭文重排一次
    let ins = Object.values(INS[H.insType]).reduce((o, g) => ({ ...o, [Object.keys(g)[0]]: 10 }), {});
    let steps, best;
    for (let round = 0; round < 2; round++) {
      steps = purchase(H, build, P.prefix, ins);
      const bag4 = bagAt(steps, H.budget4);
      best = null;
      for (const c of insList) {
        const late = total(H, build, c, 15);
        const caps = H.caps(late);
        const hit = caps.filter(([, v, th]) => v + 1e-9 >= th).length;
        const p4 = powerOf(H, total(H, bag4, c, 4), H.target4);
        const pl = H.late(late);
        if (!best || hit > best.hit || (hit === best.hit && p4 * pl > best.p4 * best.pl)) best = { ins: c, hit, p4, pl, caps };
      }
      ins = best.ins;
    }
    rows.push({ bn, build, steps, ...best, bag4: bagAt(steps, H.budget4) });
  }
  const p4max = Math.max(...rows.map((r) => r.p4)), plmax = Math.max(...rows.map((r) => r.pl));
  rows.forEach((r) => { r.e = r.p4 / p4max * 100; r.l = r.pl / plmax * 100; r.mix = Math.sqrt(r.e * r.l); });
  const maxHit = Math.max(...rows.map((r) => r.hit));
  rows.sort((a, b) => (b.mix - a.mix) || (b.hit - a.hit));          // 按综合强度排名
  const capsBest = rows.slice().sort((a, b) => (b.hit - a.hit) || (b.mix - a.mix))[0];
  return { P, H, rows, maxHit, capsBest };
}

if (require.main === module) {
  const which = process.argv[2] ? [process.argv[2]] : Object.keys(PLANS);
  for (const name of which) {
    const { H, rows, capsBest } = evaluate(name);
    console.log(`\n################ ${name}`);
    for (const r of rows) console.log(`  综合 ${r.mix.toFixed(1)}（4级 ${r.e.toFixed(1)} 后期 ${r.l.toFixed(1)}）卡 ${r.hit}/${r.caps.length} | ${r.bn}：${r.build.join(" → ")} | ${fmtIns(r.ins)}`);
    for (const [tag, b] of [["★ 综合最强", rows[0]], ["◆ 卡阈值最多", capsBest]]) {
    if (tag.startsWith("◆") && b === rows[0]) { console.log("  ◆ 卡阈值最多：同上"); continue; }
    const s4 = total(H, b.bag4, b.ins, 4), s15 = total(H, b.build, b.ins, 15);
    console.log(`  ${tag}：${b.bn}，铭文 ${fmtIns(b.ins)}`);
    console.log(`    阈值：` + b.caps.map(([n, v, th]) => `${n.split("（")[0]} ${v.toFixed(1)}${v + 1e-9 >= th ? "✔" : "✘"}`).join("  "));
    console.log(`    4 级背包（约 ${H.budget4} 金）：${b.bag4.join(" + ")}`);
    console.log(`    4 级面板：物攻 ${s4.atk.toFixed(0)} 法攻 ${s4.ap.toFixed(0)} 攻速 ${s4.as.toFixed(0)}% 暴击 ${s4.crit.toFixed(0)}% 冷却 ${s4.cdrRaw.toFixed(1)}%` + (s4.maxHp ? ` 生命 ${s4.maxHp.toFixed(0)} 护甲 ${s4.armor.toFixed(0)}` : ""));
    console.log(`    15 级面板：物攻 ${s15.atk.toFixed(0)} 法攻 ${s15.ap.toFixed(0)} 攻速 ${s15.as.toFixed(0)}% 暴击 ${s15.crit.toFixed(0)}% 冷却 ${s15.cdrRaw.toFixed(1)}%` + (s15.maxHp ? ` 生命 ${s15.maxHp.toFixed(0)} 护甲 ${s15.armor.toFixed(0)} 法抗 ${s15.mr.toFixed(0)}` : ""));
    console.log(`    购买顺序：` + b.steps.map((st) => st.merged ? `【${st.buy}】` : st.buy).join(" → "));
    }
  }
}
module.exports = { PLANS, evaluate };
