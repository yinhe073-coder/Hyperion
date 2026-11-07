// 4 级最强 / 发育最快 + 大后期卡阈值：node early-late.js [后羿|孙悟空|米莱狄]
//
// 装备数值和合成配方：data/camp-equip-2026-11-06.json（王者营地装备库接口原样数据）
// 技能参数：王者荣耀官网英雄页（pvp.qq.com/web201605/herodetail/*.shtml），官网页可能滞后于版本
// 英雄基础攻击、目标护甲/法抗/血量、4 级经济：估计值（标了「估」），只用来比较方案，不代表游戏内绝对数字
const fs = require("fs");
const path = require("path");
const DB = JSON.parse(fs.readFileSync(path.join(__dirname, "data/camp-equip-2026-11-06.json"), "utf8"));
const byId = Object.fromEntries(DB.map((e) => [e.epId, e]));
const byName = Object.fromEntries(DB.map((e) => [e.name, e]));

// ---------- 装备：营地字段 → 属性 ----------
// 带被动的装备，按营地描述手工补充（远程翻倍已按英雄处理）
const PASSIVE = {
  "影刃": { asOnHit: 10 },                           // 普攻 +10% 攻速，暴击翻倍
  "无尽战刃": { critDmgDyn: 1 },                      // +20% 暴击效果，每 2% 暴击率再 +1%（最多 +50%）
  "仁者破晓": { pen: 15, onHitFlat: 25, rangedDouble: 1 },
  "逐日之弓": { onHitFlat: 25, rangedDouble: 1 },
  "末世": { pBase: 74.3, pLvl: 5.71, pctBonusHp: 7 },
  "闪电匕首": { mBase: 84.8, mLvl: 8.57 },
  "强者破军": { execute: 30 },
  "碎星锤": { pen: 30 },
  "暗影战斧": { penFlatBase: 84, penFlatLvl: 6.43 },  // 90~180 随等级
  "宗师之力": { skillHit: 0.8 },                      // 用技能后下次普攻 +80% 物攻
  // 打野刀：击杀野怪叠层，按「每级约 2 层」估算
  "追击刀锋": { stackAtk: 3, stackMax: 15, jungle: 1 },
  "贪婪之噬": { stackAtk: 3, stackCdr: 0.2, stackMax: 25, jungle: 1 },
  "游击弯刀": { stackAp: 6, stackMax: 15, jungle: 1 },
  "符文大剑": { stackAp: 6, stackCdr: 0.2, stackMax: 25, jungle: 1 },
  "狩猎宽刃": { jungle: 1 },
  "神速之靴": { msFlat: 30 },
  "急速战靴": { msFlat: 50 }, "冷静之靴": { msFlat: 50 }, "抵抗之靴": { msFlat: 50 }, "影忍之足": { msFlat: 50 },
  "疾步之靴": { msFlat: 70 }, "秘法之靴": { msFlat: 50, mpenFlatBase: 55.7, mpenFlatLvl: 4.29 },
  "博学者之怒": { apPct: 30 },
  "虚无法杖": { mpenPct: 45 },
  "日暮之流": { mpenFlatBase: 118.6, mpenFlatLvl: 8.57 }, // 打英雄叠 6 层：120~240
  "痛苦面具": { curHpPctPer3s: 12 },                  // 技能命中：3 秒内 4 次 3% 当前生命
  "凝冰之息": { procBase: 69.6, procLvl: 5.36, procAp: 0.15, procCd: 3 },
  "回响之杖": { procBase: 130, procLvl: 10, procAp: 0.28, procCd: 5 },
  "贤者天书": { dmgPerAp: 0.00005 },                  // 每 100 法攻 +0.5% 增伤 = 每 1 法攻 +0.005%
  "金色圣剑": { onHitFlat: 60, apOnHitFull: 0.3, asOnHit: 20 },
  // 廉颇相关肉装被动（按最大生命折算）
  "红莲斗篷": { burnHpPct: 1.5 },                      // 每秒 1.5% 最大生命法伤
  "怒龙剑盾": { procHpPct: 3.5, procHpCd: 2 },         // 普攻/技能 3.5% 最大生命物伤（冷却 2 秒）
  "血魔之怒": { hitHpPct: 1.5 },                      // 普攻 +1.5% 最大生命物伤
  "侵掠·怒魂": { hitHpPct: 1.5 },
  "霸者重装": { hpPct: 4 },
  "魔女斗篷": { shield: 600 }, "冰霜冲击": { shieldHpPct: 10 }, "旭日初光": { shieldHpPct: 4 },
};
const FIELD = { phyAttack: ["atk", 1], attackSpeed: ["as", 0.01], criticalHit: ["crit", 0.01], healthSteal: ["ls", 0.01],
  magicAttack: ["ap", 1], cdReduce: ["cdr", 0.01], moveSpeed: ["ms", 0.01], healthPoint: ["hp", 1], mgcHemophagia: ["mls", 0.01],
  phyDefence: ["armor", 1], magicDefence: ["mr", 1] };
function itemStats(name, ranged) {
  const e = byName[name];
  if (!e) throw new Error("营地装备库里没有：" + name);
  const s = { price: e.money };
  for (const [k, [f, m]] of Object.entries(FIELD)) if (e[k]) s[f] = e[k] * m;
  const p = PASSIVE[name] || {};
  for (const [k, v] of Object.entries(p)) if (k !== "rangedDouble") s[k] = (p.rangedDouble && ranged && (k === "pen" || k === "onHitFlat")) ? v * 2 : v;
  return s;
}
// 营地的 preEpId 会把「子件的子件」也一起列出，只保留直接子件（不是其他列出零件的下级）
const rawRecipe = (name) => (byName[name].preEpId || []).map((i) => byId[i].name);
const recipeCache = {};
function recipe(name) {
  if (recipeCache[name]) return recipeCache[name];
  const list = rawRecipe(name);
  const desc = new Set();
  const addDesc = (n) => { for (const k of rawRecipe(n)) { desc.add(k); addDesc(k); } };
  list.forEach(addDesc);
  const direct = list.slice();
  for (const d of desc) { const i = direct.indexOf(d); if (i >= 0) direct.splice(i, 1); }   // 每出现一次下级就去掉一个
  return (recipeCache[name] = direct);
}

// ---------- 铭文（每颗；由常见套装合计反推）----------
const INS = {
  phys: {
    red: { 无双: { crit: 0.7, critDmg: 3.6 }, 祸源: { crit: 1.6 }, 红月: { as: 1.6, crit: 0.5 }, 异变: { atk: 2, penFlat: 3.6 } },
    blue: { 狩猎: { as: 1, msPct: 1 }, 夺萃: { ls: 1 }, 隐匿: { atk: 1.6, msPct: 1 } },
    green: { 鹰眼: { atk: 0.9, penFlat: 6.4 } },
  },
  tank: {
    red: { 宿命: { hp: 33.7, armor: 2.3, as: 1 }, 异变: { atk: 2, penFlat: 3.6 } },
    blue: { 调和: { hp: 45, msPct: 0.4 }, 狩猎: { as: 1, msPct: 1 } },
    green: { 虚空: { hp: 37.5, cdr: 0.6 }, 鹰眼: { atk: 0.9, penFlat: 6.4 } },
  },
  magic: {
    red: { 梦魇: { ap: 4.2, mpenFlat: 2.4 }, 圣人: { ap: 5.3 } },
    blue: { 狩猎: { as: 1, msPct: 1 }, 轮回: { ap: 2.4, mls: 1 }, 调和: { msPct: 0.4 } },
    green: { 心眼: { mpenFlat: 6.4, as: 0.6 }, 虚空: { cdr: 0.6 } },   // 心眼：「88 法穿」= 10 梦魇 + 10 心眼反推
  },
};
function insCandidates(groups, step = 1) {
  const pairs = (names) => {
    const out = [];
    names.forEach((a, i) => {
      out.push({ [a]: 10 });
      for (const b of names.slice(i + 1)) for (let n = step; n <= 10 - step; n += step) out.push({ [a]: n, [b]: 10 - n });
    });
    return out;
  };
  let out = [{}];
  for (const g of Object.values(groups)) out = out.flatMap((o) => pairs(Object.keys(g)).map((p) => ({ ...o, ...p })));
  return out;
}
const fmtIns = (ins) => Object.entries(ins).map(([k, v]) => v + k).join(" ");

// ---------- 属性汇总（拆成「累加」和「派生」两步，方便大后期枚举时复用）----------
const insAllOf = (hero) => Object.assign({}, ...Object.values(INS[hero.insType]));
function rawItems(hero, items) {
  const s = { price: 0, procs: [] };
  for (const n of items) {
    const it = itemStats(n, hero.ranged);
    for (const [k, v] of Object.entries(it)) if (typeof v === "number") s[k] = (s[k] || 0) + v;
    const p = PASSIVE[n]; if (p && p.procBase) s.procs.push(p);
  }
  return s;
}
function rawIns(hero, ins) {
  const all = insAllOf(hero), s = {};
  for (const [n, c] of Object.entries(ins)) for (const [k, v] of Object.entries(all[n])) s[k] = (s[k] || 0) + v * c;
  return s;
}
function derive(hero, a, b, level) {
  const g = (k) => (a[k] || 0) + (b[k] || 0);
  const r = {
    price: a.price, level,
    atk: hero.baseAtk + hero.atkLvl * (level - 1) + g("atk") + g("stackAtk") * Math.min(g("stackMax") || 0, 2 * level),
    ap: (g("ap") + g("stackAp") * Math.min(g("stackMax") || 0, 2 * level)) * (1 + g("apPct") / 100),
    crit: Math.min(100, hero.baseCrit + g("crit")), critRaw: hero.baseCrit + g("crit"),
    pen: g("pen"), penFlat: g("penFlat") + g("penFlatBase") + g("penFlatLvl") * level,
    mpenFlat: g("mpenFlat") + g("mpenFlatBase") + g("mpenFlatLvl") * level, mpenPct: g("mpenPct"),
    cdrRaw: g("cdr") + g("stackCdr") * Math.min(g("stackMax") || 0, 2 * level), ls: g("ls"), hp: g("hp"), jungle: g("jungle") > 0,
    onHitFlat: g("onHitFlat"), pBase: g("pBase") + g("pLvl") * level, pctBonusHp: g("pctBonusHp"),
    m: g("mBase") + g("mLvl") * level, execute: g("execute"), skillHit: g("skillHit"),
    curHpPctPer3s: g("curHpPctPer3s"), proc: a.procs, dmgPerAp: g("dmgPerAp"),
    msFlat: g("msFlat"), msPct: g("ms") + g("msPct"),
    burnHpPct: g("burnHpPct"), procHpPct: g("procHpPct"), hitHpPct: g("hitHpPct"), shield: g("shield"), shieldHpPct: g("shieldHpPct"),
  };
  if (hero.baseHp) {                       // 坦克：生命、护甲、法抗
    r.maxHp = (hero.baseHp + hero.hpLvl * (level - 1) + g("hp")) * (1 + g("hpPct") / 100);
    r.armor = hero.baseArmor + hero.armorLvl * (level - 1) + g("armor");
    r.mr = hero.baseMr + hero.mrLvl * (level - 1) + g("mr");
    r.ehp = (r.maxHp + r.shield + r.shieldHpPct / 100 * r.maxHp) * ((1 + r.armor / 602) + (1 + r.mr / 602)) / 2;
  }
  r.critDmg = hero.baseCritDmg + g("critDmg") + (g("critDmgDyn") ? Math.min(50, 20 + r.crit / 2) : 0);
  r.cdr = Math.min(40, r.cdrRaw);
  r.as = (hero.growthAS || 0) * (level - 1) + g("as") + g("asOnHit") * (1 + r.crit / 100) + (hero.passiveAS || 0);
  r.critMult = 1 + (r.crit / 100) * (r.critDmg / 100 - 1);
  return r;
}
const total = (hero, items, ins, level) => derive(hero, rawItems(hero, items), rawIns(hero, ins), level);
// 档位：有完整档位表时向下取档；只知道上限（后羿、米莱狄）时上限以下按连续计算
const tierOf = (as, T) => (T.length === 1 ? Math.min(as, T[0]) : (T.filter((t) => as + 1e-9 >= t).pop() ?? 0));
const physRed = (s, arm) => 602 / (602 + Math.max(0, arm * (1 - s.pen / 100) - s.penFlat));
const magRed = (s, mr) => 602 / (602 + Math.max(0, mr * (1 - s.mpenPct / 100) - s.mpenFlat));

// ---------- 英雄模型 ----------
const HEROES = {
  "后羿": {
    ranged: true, insType: "phys", baseAtk: 170, atkLvl: 13.8, baseCrit: 0, baseCritDmg: 200,   // 基础攻击：估
    growthAS: 1, passiveAS: 12,          // 官网：被动每层 +4% 攻速，3 层 12%
    T: [153.2], budget4: 1500, target4: { armor: 200, mr: 150, hp: 2600 },
    starts: [["急速战靴", "影刃"], ["影刃", "急速战靴"], ["急速战靴", "仁者破晓"], ["急速战靴", "无尽战刃"], ["急速战靴", "末世"], ["急速战靴", "闪电匕首"]],
    // 4 级：一技能（2 级 130 + 75% 物攻，每次普攻）开 5 秒 + 二技能（1 级 300 + 50% 物攻，法伤）+ 大招（1 级 700 + 90% 物攻）
    // 被动 3 层后三连射总伤 130%
    burst4(s, t) {
      const aps = 1 + tierOf(s.as, this.T) / 100;
      const hit = (s.atk * s.critMult + 130 + 0.75 * s.atk + s.onHitFlat + s.pBase) * 1.3 * physRed(s, t.armor);
      return 5 * aps * hit + s.m * 5 * aps * magRed(s, t.mr) + (300 + 0.5 * s.atk) * magRed(s, t.mr) + (700 + 0.9 * s.atk) * physRed(s, t.armor);
    },
    farm4(s) { return (1 + tierOf(s.as, this.T) / 100) * (s.atk * s.critMult + s.onHitFlat + s.pBase) * 1.3; },
    fullRest: ["影刃", "仁者破晓", "末世", "贤者的庇护"],
    lateItems: ["影刃", "无尽战刃", "仁者破晓", "末世", "逐日之弓", "闪电匕首", "泣血之刃", "制裁之刃", "幽影袖箭", "强者破军", "名刀·司命", "贤者的庇护"],
    lateBoots: ["急速战靴"],
    caps(s) { return [["攻速≥153.2%", s.as, 153.2], ["暴击≥100%", s.critRaw, 100], ["无尽暴击效果满（暴击≥60%）", s.critRaw, 60]]; },
    late(s) { // 后期每秒普攻伤害（脆皮、坦克平均）
      const aps = 1 + Math.min(s.as, 153.2) / 100;
      return [{ armor: 400, mr: 300, bonus: 800 }, { armor: 800, mr: 500, bonus: 4000 }].reduce((a, t) =>
        a + aps * ((s.atk * s.critMult + s.onHitFlat + s.pBase + s.pctBonusHp / 100 * t.bonus) * (1 + s.execute / 200) * physRed(s, t.armor)
          + s.m * magRed(s, t.mr)), 0) / 2;
    },
  },
  "孙悟空": {
    ranged: false, insType: "phys", baseAtk: 180, atkLvl: 12, baseCrit: 20, baseCritDmg: 150,   // 官网：天生 20% 暴击、150% 暴击效果；基础攻击：估
    growthAS: 1, passiveAS: 0,
    T: [0, 1, 8.2, 16.6, 26.2, 37.6, 51.4, 68.2, 89.2, 116, 152],
    forceFirst: "追击刀锋",
    budget4: 1400, target4: { armor: 200, mr: 150, hp: 2600 },
    starts: [["追击刀锋", "急速战靴"], ["追击刀锋", "无尽战刃"], ["追击刀锋", "影刃"], ["追击刀锋", "暗影战斧"], ["追击刀锋", "宗师之力"], ["追击刀锋", "碎星锤"]],
    // 4 级连招：二技能突进 → 被动强力敲击（475 + 100% 物攻，可暴击）→ 大招（1 级 150 + 50% 物攻）→ 3 次印记普攻（每次 +270），
    // 第 1 次印记普攻也是强力敲击；宗师之力：用技能后下一次普攻 +80% 物攻
    burst4(s, t) {
      const cm = s.critMult, r = physRed(s, t.armor), smash = (475 + s.atk) * cm;
      return (smash + (150 + 0.5 * s.atk) + (smash + 270) + 2 * (s.atk * cm + 270) + s.skillHit * s.atk) * r;
    },
    // 刷野：普攻 × 攻速 + 打野刀对野怪的灼烧
    farm4(s) { return (1 + tierOf(s.as, this.T) / 100) * s.atk * s.critMult + (s.jungle ? 2 * 90 : 0); },
    fullRest: ["急速战靴", "无尽战刃", "暗影战斧", "名刀·司命"],
    lateItems: ["无尽战刃", "影刃", "宗师之力", "暗影战斧", "贪婪之噬", "碎星锤", "末世", "强者破军", "泣血之刃", "名刀·司命", "贤者的庇护", "血魔之怒", "冰痕之握", "闪电匕首", "制裁之刃"],
    lateBoots: ["急速战靴", "抵抗之靴", "影忍之足"],
    caps(s) { return [["攻速≥152%", s.as, 152], ["暴击≥100%", s.critRaw, 100], ["无尽暴击效果满（暴击≥60%）", s.critRaw, 60], ["冷却≥40%", s.cdrRaw, 40]]; },
    late(s) {
      const aps = 1 + tierOf(s.as, this.T) / 100;
      return [{ armor: 400, bonus: 800 }, { armor: 800, bonus: 4000 }].reduce((a, t) =>
        a + (aps * (s.atk * s.critMult + s.pBase + s.pctBonusHp / 100 * t.bonus) + (475 + s.atk) * s.critMult / 3 + s.skillHit * s.atk / 3)
          * (1 + s.execute / 200) * physRed(s, t.armor), 0) / 2;
    },
  },
  "米莱狄": {
    ranged: true, insType: "magic", baseAtk: 160, atkLvl: 10, baseCrit: 0, baseCritDmg: 200, growthAS: 1, passiveAS: 0,
    T: [100], budget4: 1400, target4: { armor: 200, mr: 150, hp: 2600 },
    starts: [["冷静之靴", "梦魇之牙"], ["秘法之靴", "梦魇之牙"], ["冷静之靴", "痛苦面具"], ["秘法之靴", "博学者之怒"], ["冷静之靴", "回响之杖"], ["秘法之靴", "凝冰之息"], ["冷静之靴", "日暮之流"]],
    // 4 级 5 秒连招（官网参数）：二技能 2 次（每次落地 120+20% 法攻，召 2 个机器人，每个打 4 下，每下 120+17.1×4+25% 法攻）
    // + 一技能 2 级（3 次 80+7% + 导弹 140+14%）+ 大招 1 级（6 跳 80+4%，结束再爆 25%）+ 装备特效
    burst4(s, t) {
      const ap = s.ap, mr = magRed(s, t.mr);
      const robots = 2 * (120 + 0.2 * ap) + 4 * 4 * (120 + 17.1 * 4 + 0.25 * ap);
      const q = 3 * (80 + 0.07 * ap) + (140 + 0.14 * ap);
      const ult = 6 * (80 + 0.04 * ap) * 1.25;
      const procs = s.proc.reduce((a, p) => a + (p.procBase + p.procLvl * 4 + p.procAp * ap) * Math.ceil(5 / p.procCd), 0);
      const mask = (s.curHpPctPer3s / 100) * t.hp * 0.9 * 2;
      return (robots + q + ult + procs + mask) * mr * (1 + s.dmgPerAp * ap);
    },
    // 清线 / 推塔：机器人（每 16×(1−冷却) 秒储备 1 个，取 2 个同时在场）+ 一技能
    farm4(s) { const ap = s.ap; return 2 * (120 + 17.1 * 4 + 0.25 * ap) / (1 - s.cdr / 100) * 0.6 + (90 + 0.07 * ap) * 4 / (7.6 * (1 - s.cdr / 100)); },
    fullRest: ["日暮之流", "博学者之怒", "贤者天书", "虚无法杖"],
    lateItems: ["梦魇之牙", "痛苦面具", "日暮之流", "凝冰之息", "博学者之怒", "贤者天书", "回响之杖", "虚无法杖", "辉月", "炽热支配", "金色圣剑", "贤者的庇护", "名刀·司命"],
    lateBoots: ["冷静之靴", "秘法之靴", "疾步之靴"],
    caps(s) { return [["冷却≥40%", s.cdrRaw, 40]]; },
    late(s) { // 15 级：拆塔（机器人）× 打人（技能 + 装备特效，法穿）几何平均
      const ap = s.ap, cd = 1 - s.cdr / 100;
      const tower = (2 + 2 * (1 / cd - 1)) * (120 + 17.1 * 15 + 0.25 * ap);
      const t = { mr: 400, hp: 4000 };
      const pvp = ((120 + 0.07 * ap) * 4 + (200 + 0.2 * ap) * 2 + 6 * (160 + 0.04 * ap) * 1.5
        + s.proc.reduce((a, p) => a + (p.procBase + p.procLvl * 15 + p.procAp * ap) * (6 / p.procCd), 0)
        + (s.curHpPctPer3s / 100) * t.hp * 0.9 * 2) / (6 * cd) * magRed(s, t.mr) * (1 + s.dmgPerAp * ap);
      return Math.sqrt(tower * pvp);
    },
  },
};

// 4 级强度 = sqrt(爆发 × 发育) × (1 + 移速权重 × 移速加成%)；移速加成 = 鞋子固定移速 ÷ 基础移速 + 百分比移速
const MS_WEIGHT = { jungle: 0.5, lane: 0.3 };
function powerOf(H, s, t) {
  const msPct = (s.msFlat / (H.baseMs || 370)) * 100 + s.msPct;
  const w = H.msWeight ?? (H.forceFirst ? MS_WEIGHT.jungle : MS_WEIGHT.lane);
  return Math.sqrt(H.burst4(s, t) * H.farm4(s)) * (1 + w * msPct / 100);
}

// ---------- 廉颇（对抗路）----------
// 官网技能：一技能 150~250+65% 物攻（击飞）+ 第三下普攻 200~500+15%；二技能 100~225+100% 物攻+4% 最大生命（中心最高 +100%）；
// 大招三段：60/90/120+60%+3% 生命，90+90%+4% 生命，120+150%+6% 生命；被动：满战意 20% 减伤、+30% 攻速
// 基础生命 / 护甲 / 法抗：估。强度 = sqrt(爆发 × 等效血量)
HEROES["廉颇"] = {
  ranged: false, insType: "tank", baseAtk: 170, atkLvl: 11, baseCrit: 0, baseCritDmg: 200, growthAS: 1, passiveAS: 30,
  baseHp: 3300, hpLvl: 260, baseArmor: 150, armorLvl: 15, baseMr: 75, mrLvl: 6, baseMs: 380,
  T: [100], budget4: 1300, target4: { armor: 200, mr: 150, hp: 2600 },
  burst4(s, t) {
    const h = s.maxHp, a = s.atk, r = physRed(s, t.armor);
    const phys = (170 + 0.65 * a) + (260 + 0.15 * a) + 1.5 * (100 + a + 0.04 * h)
      + (60 + 0.6 * a + 0.03 * h) + (90 + 0.9 * a + 0.04 * h) + (120 + 1.5 * a + 0.06 * h)
      + s.procHpPct / 100 * h * 2 + s.hitHpPct / 100 * h * 3;
    return phys * r + s.burnHpPct / 100 * h * 3 * magRed(s, t.mr);
  },
  farm4(s) { return s.ehp; },            // 坦克用等效血量代替刷野速度
  caps(s) { return [["冷却≥40%", s.cdrRaw, 40]]; },
  late(s) {
    const h = s.maxHp, a = s.atk, r = physRed(s, 600);
    const dmg = ((250 + 0.65 * a) + (500 + 0.15 * a) + 1.5 * (225 + a + 0.04 * h) + (120 + 0.6 * a + 0.03 * h) + (90 + 0.9 * a + 0.04 * h)
      + (120 + 1.5 * a + 0.06 * h) + s.procHpPct / 100 * h * 2 + s.hitHpPct / 100 * h * 4) * r + s.burnHpPct / 100 * h * 4 * magRed(s, 400);
    return Math.sqrt(dmg * s.ehp) / (1 - Math.min(40, s.cdrRaw) / 100 * 0.5);   // 冷却让技能更勤，按一半效果计
  },
};

// ---------- 米莱狄的两个分路版本 ----------
// 打野：带惩戒，出门游击弯刀（法术打野刀），后期固定符文大剑；刷野时打野刀灼烧 + 机器人一起打（机器人吃野怪击杀召唤）
HEROES["米莱狄·打野"] = Object.assign(Object.create(HEROES["米莱狄"]), {
  forceFirst: "游击弯刀", budget4: 1400,
  starts: [["游击弯刀", "冷静之靴"], ["游击弯刀", "秘法之靴"], ["游击弯刀", "疾步之靴"], ["游击弯刀", "符文大剑"],
    ["游击弯刀", "回响之杖"], ["游击弯刀", "梦魇之牙"], ["游击弯刀", "博学者之怒"], ["游击弯刀", "日暮之流"]],
  farm4(s) { return HEROES["米莱狄"].farm4(s) + (s.jungle ? 2 * (75 + 0.0045 * 3000) : 0); },
  fullRest: ["符文大剑", "冷静之靴", "博学者之怒", "贤者天书", "虚无法杖"],
  lateFixed: ["符文大剑"],
  lateItems: ["梦魇之牙", "痛苦面具", "日暮之流", "凝冰之息", "博学者之怒", "贤者天书", "回响之杖", "虚无法杖", "辉月", "炽热支配", "金色圣剑", "贤者的庇护", "名刀·司命"],
});
// 对抗路：带传送，单人线；4 级时经济约 1200 金（比中路少）
HEROES["米莱狄·对抗路"] = Object.assign(Object.create(HEROES["米莱狄"]), {
  budget4: 1200, msWeight: 0.5,          // 单人线要换线、躲 gank、拆完塔撤退，移速按打野同等看待
  starts: [["冷静之靴", "回响之杖"], ["秘法之靴", "梦魇之牙"], ["疾步之靴", "回响之杖"], ["冷静之靴", "痛苦面具"],
    ["秘法之靴", "凝冰之息"], ["冷静之靴", "日暮之流"], ["疾步之靴", "梦魇之牙"], ["秘法之靴", "博学者之怒"]],
});

// ---------- 购买顺序模拟（按真实配方展开到小件）----------
// 每一步在「还没买、且子件都已凑齐」的节点里，选「每 1 金增加的 4 级强度最多」的那个；背包最多 6 格
function planPurchase(hero, cores, ins, scoreFn) {
  // 打野刀这类「出门必买」的装备先按配方顺序买齐，其余再按性价比排
  if (hero.forceFirst && cores[0] === hero.forceFirst) {
    const first = [], walkF = (n) => { recipe(n).forEach(walkF); first.push(n); };
    walkF(hero.forceFirst);
    let g = 0; const steps0 = [];
    for (const n of first) {
      const kids = recipe(n), cost = byName[n].money - kids.reduce((a, k) => a + byName[k].money, 0);
      g += cost; steps0.push({ buy: n, cost, gold: g, bag: [n], merged: kids.length > 0 });
    }
    const rest = planPurchaseInner(hero, cores.slice(1), scoreFn, [hero.forceFirst], g);
    return steps0.concat(rest);
  }
  return planPurchaseInner(hero, cores, scoreFn, [], 0);
}
function planPurchaseInner(hero, cores, scoreFn, initOwned, initGold) {
  // 一次只凑一件：先挑「合成后每 1 金增加强度最多」的下一件，再按性价比顺序买它的小件
  const owned = initOwned.slice(), steps = [];
  let gold = initGold;
  const left = cores.slice();
  const take = (bag, n) => { const i = bag.indexOf(n); if (i >= 0) { bag.splice(i, 1); return true; } return false; };
  // 把 bag 里已有的子件消耗掉，返回合成 n 还要花的钱
  const remainCost = (bag, n) => { const b = bag.slice(); const f = (x) => (take(b, x) ? 0 : byName[x].money - recipe(x).reduce((a, k) => a + byName[k].money, 0) + recipe(x).reduce((a, k) => a + f(k), 0)); return f(n); };
  while (left.length) {
    let pick = null;
    for (const c of left) {
      const after = owned.slice(); const consume = (x) => { if (!take(after, x)) recipe(x).forEach(consume); };
      consume(c); after.push(c);
      const v = (scoreFn(after) - scoreFn(owned)) / Math.max(remainCost(owned, c), 1);
      if (!pick || v > pick.v) pick = { c, v };
    }
    const c = pick.c; left.splice(left.indexOf(c), 1);
    // 这件装备的配方树（后序），去掉背包里已有的
    const need = [], walk = (x, bag) => { if (take(bag, x)) return; recipe(x).forEach((k) => walk(k, bag)); need.push(x); };
    walk(c, owned.slice());
    const done = new Array(need.length).fill(false);
    while (done.some((d) => !d)) {
      let best = null;
      for (let i = 0; i < need.length; i++) {
        if (done[i]) continue;
        const kids = recipe(need[i]);
        const nb = owned.slice();
        if (!kids.every((k) => take(nb, k)) && kids.length) continue;   // 子件没凑齐
        nb.push(need[i]);
        if (nb.length > 6) continue;
        const cost = byName[need[i]].money - kids.reduce((a, k) => a + byName[k].money, 0);
        const v = (scoreFn(nb) - scoreFn(owned)) / Math.max(cost, 1);
        if (!best || v > best.v + 1e-12 || (Math.abs(v - best.v) < 1e-12 && cost < best.cost)) best = { i, v, cost, nb, merged: kids.length > 0 };
      }
      if (!best) {
        // 格子不够拆成小件：整件购买（缺的零件差价一次付清），游戏里也是这么买的
        const cost = remainCost(owned, c);
        const nb = owned.slice(); const consume = (x) => { if (!take(nb, x)) recipe(x).forEach(consume); };
        consume(c); nb.push(c);
        owned.splice(0, owned.length, ...nb); gold += cost;
        steps.push({ buy: c + "（格子不够，整件买）", cost, gold, bag: owned.slice(), merged: true });
        break;
      }
      done[best.i] = true;
      owned.splice(0, owned.length, ...best.nb);
      gold += best.cost;
      steps.push({ buy: need[best.i], cost: best.cost, gold, bag: owned.slice(), merged: best.merged });
    }
  }
  return steps;
}

function early(heroName) {
  const H = HEROES[heroName];
  const lvl = 4, t = H.target4;
  const insList = insCandidates(INS[H.insType]);
  const bagAt = (steps, budget) => { let bag = []; for (const st of steps) if (st.gold <= budget) bag = st.bag; return bag; };
  // 4 级强度 = 爆发 × 发育速度 的几何平均（两者各占一半）
  const power = (items, ins) => powerOf(H, total(H, items, ins, lvl), t);
  let best = null;
  const all = [];
  for (const start of H.starts) {
    // 先用默认铭文排出购买顺序，再在这个顺序下挑铭文，再用新铭文重排一次
    let ins = Object.values(INS[H.insType]).reduce((o, g) => ({ ...o, [Object.keys(g)[0]]: 10 }), {});
    let steps;
    for (let round = 0; round < 2; round++) {
      steps = planPurchase(H, start, ins, (bag) => power(bag, ins));
      const bag = bagAt(steps, H.budget4);
      ins = insList.reduce((b, c) => (power(bag, c) > power(bag, b) ? c : b), insList[0]);
    }
    const bag = bagAt(steps, H.budget4);
    const sc = power(bag, ins);
    const robust = [-300, 300].map((d) => power(bagAt(steps, H.budget4 + d), ins));
    all.push({ start, sc, bag, ins });
    if (!best || sc > best.sc) best = { start, steps, ins, bag, sc, robust };
  }
  best.all = all;
  return best;
}

function late(heroName) {
  const H = HEROES[heroName];
  const insList = insCandidates(INS[H.insType], 2).map((ins) => ({ ins, raw: rawIns(H, ins) }));
  const combos = (arr, k) => (k === 0 ? [[]] : arr.length < k ? [] : [...combos(arr.slice(1), k - 1).map((c) => [arr[0], ...c]), ...combos(arr.slice(1), k)]);
  let maxHit = -1, top = [], bestDmg = 0, n = 0, bestDmgRow = null;
  const perIns = new Map();               // 每套铭文：后期能卡住的最多阈值数，以及此时伤害最高的出装
  const fixed = H.lateFixed || [];
  for (const boot of H.lateBoots) for (const c of combos(H.lateItems.filter((n) => !fixed.includes(n)), 5 - fixed.length)) {
    const items = [boot, ...fixed, ...c];
    const ri = rawItems(H, items);
    for (const { ins, raw } of insList) {
      const s = derive(H, ri, raw, 15);
      const caps = H.caps(s);
      const hit = caps.filter(([, v, th]) => v + 1e-9 >= th).length;
      const over = caps.reduce((a, [, v, th]) => a + (v >= th ? (v - th) / th : 0), 0);
      const dmg = H.late(s);
      n++;
      if (dmg > bestDmg) { bestDmg = dmg; bestDmgRow = { items, ins, hit, dmg, s, caps }; }
      const key = fmtIns(ins), cur = perIns.get(key);
      if (!cur || hit > cur.hit || (hit === cur.hit && dmg > cur.dmg)) perIns.set(key, { ins, items, hit, dmg, caps });
      if (hit > maxHit) { maxHit = hit; top = []; }
      if (hit === maxHit) { top.push({ items, ins, hit, over, dmg, s, caps }); if (top.length > 400) { top.sort((x, y) => y.dmg - x.dmg); top.length = 50; } }
    }
  }
  top.sort((x, y) => y.dmg - x.dmg);
  return { maxHit, top: top.slice(0, 5), bestDmg, bestDmgRow, nCombos: n, perIns };
}

// 铭文整局不能换：找一套铭文同时照顾 4 级和大后期
// 4 级强度 = 各起手方案（背包按各自最佳购买顺序）配这套铭文的最高强度
function joint(heroName) {
  const H = HEROES[heroName];
  const e = early(heroName), L = late(heroName);
  const pw = (bag, ins) => powerOf(H, total(H, bag, ins, 4), H.target4);
  const rows = [];
  for (const [key, l] of L.perIns) {
    let bestE = 0, bestStart = null;
    for (const a of e.all) { const v = pw(a.bag, l.ins); if (v > bestE) { bestE = v; bestStart = a.start; } }
    rows.push({ key, ins: l.ins, early: bestE, start: bestStart, hit: l.hit, lateDmg: l.dmg, items: l.items, caps: l.caps });
  }
  const eMax = Math.max(...rows.map((r) => r.early));
  rows.forEach((r) => { r.earlyPct = r.early / eMax * 100; r.latePct = r.lateDmg / L.bestDmg * 100; });
  const capped = rows.filter((r) => r.hit === L.maxHit).sort((a, b) => b.earlyPct - a.earlyPct || b.latePct - a.latePct);
  const oneLess = rows.filter((r) => r.hit === L.maxHit - 1).sort((a, b) => b.earlyPct - a.earlyPct || b.latePct - a.latePct);
  const earlyBest = rows.slice().sort((a, b) => b.earlyPct - a.earlyPct)[0];
  // 推荐方案的购买顺序（用这套铭文重排）
  const rec = capped[0];
  const steps = planPurchase(H, rec.start, rec.ins, (bag) => pw(bag, rec.ins));
  return { e, L, capped, oneLess, earlyBest, rec, steps };
}

// ---------- 输出 ----------
if (require.main === module && process.argv.includes("--joint")) {
  const which = process.argv[2] && process.argv[2] !== "--joint" ? [process.argv[2]] : Object.keys(HEROES);
  for (const h of which) {
    const H = HEROES[h];
    const J = joint(h);
    const show = (r) => `${fmtIns(r.ins).padEnd(22)} | 4级 ${r.earlyPct.toFixed(1)}%（起手 ${r.start.join("→")}）| 后期卡 ${r.hit} 个，伤害 ${r.latePct.toFixed(1)}%：${r.items.join("+")}`;
    console.log(`\n################ ${h}（4 级以「任意铭文下的最强」为 100%，后期伤害以「全局最高」为 100%）`);
    console.log(`  ★ 推荐（后期卡满 ${J.L.maxHit} 个阈值的铭文里，4 级最强）：`);
    J.capped.slice(0, 4).forEach((r) => console.log("     " + show(r)));
    if (J.oneLess.length) { console.log(`  少卡 1 个阈值、换 4 级更强：`); J.oneLess.slice(0, 2).forEach((r) => console.log("     " + show(r))); }
    console.log(`  对照·只看 4 级最强的铭文：\n     ${show(J.earlyBest)}`);
    const r = J.rec, s4 = total(H, (J.e.all.find((a) => a.start === r.start) || {}).bag || [], r.ins, 4);
    console.log(`  推荐方案 4 级面板：物攻 ${s4.atk.toFixed(0)} 法攻 ${s4.ap.toFixed(0)} 攻速 ${s4.as.toFixed(1)}% 暴击 ${s4.crit.toFixed(1)}% 暴击效果 ${s4.critDmg.toFixed(0)}% 物穿 ${s4.penFlat.toFixed(0)} 法穿 ${s4.mpenFlat.toFixed(0)}`);
    console.log(`  推荐方案购买顺序：` + J.steps.map((st) => `${st.gold}金 ${st.merged ? "【" + st.buy + "】" : st.buy}`).join(" → "));
    console.log(`  后期阈值：` + r.caps.map(([n, v, th]) => `${n.split("（")[0]} ${v.toFixed(1)}${v + 1e-9 >= th ? "✔" : "✘"}`).join("  "));
  }
} else if (require.main === module) {
  const which = process.argv[2] ? [process.argv[2]] : Object.keys(HEROES);
  for (const h of which) {
    const H = HEROES[h];
    console.log(`\n################ ${h}`);
    const e = early(h);
    console.log(`【4 级】经济按 ${H.budget4} 金估算；起手装备方案对比（强度 = 爆发 × 发育的几何平均，最佳 = 100）：`);
    for (const a of e.all.sort((x, y) => y.sc - x.sc)) console.log(`   ${(a.sc / e.sc * 100).toFixed(1)} | 先做 ${a.start.join(" → ")} | 4 级背包：${a.bag.join(" + ") || "空"} | 铭文 ${fmtIns(a.ins)}`);
    console.log(`  最佳：先做 ${e.start.join(" → ")}，铭文 ${fmtIns(e.ins)}；经济 ±300 金时强度 ${e.robust.map((v) => (v / e.sc * 100).toFixed(0)).join(" / ")}`);
    console.log("  购买顺序（小件 → 合成）：");
    for (const st of e.steps) console.log(`   ${String(st.gold).padStart(5)} 金 | ${st.merged ? "合成 " : "买   "}${st.buy}（+${st.cost}）| 背包 ${st.bag.length}/6：${st.bag.join("、")}`);
    const full = [...e.start, ...H.fullRest.filter((n) => !e.start.includes(n))];
    const last = e.steps[e.steps.length - 1];
    const fsteps = e.steps.concat(planPurchaseInner(H, H.fullRest.filter((n) => !e.start.includes(n)),
      (bag) => powerOf(H, total(H, bag, e.ins, 8), H.target4), last.bag, last.gold));
    console.log(`  完整 6 件（${full.join(" → ")}）的小件顺序：`);
    console.log("   " + fsteps.map((st) => `${st.merged ? "【" + st.buy + "】" : st.buy}`).join(" → "));
    const s4 = total(H, e.bag, e.ins, 4);
    console.log(`  4 级面板：物攻 ${s4.atk.toFixed(0)} 法攻 ${s4.ap.toFixed(0)} 攻速 ${s4.as.toFixed(1)}%（档位 ${tierOf(s4.as, H.T)}）暴击 ${s4.crit.toFixed(1)}% 暴击效果 ${s4.critDmg.toFixed(0)}% 物穿 ${s4.penFlat.toFixed(0)}+${s4.pen}% 法穿 ${s4.mpenFlat.toFixed(0)}+${s4.mpenPct}% 冷却 ${s4.cdr.toFixed(1)}%`);
    const L = late(h);
    console.log(`【大后期】枚举 ${L.nCombos} 种「6 件 × 铭文」组合；最多能同时卡住 ${L.maxHit}/${H.caps(L.top[0].s).length} 个阈值：`);
    const b = L.bestDmgRow;
    console.log(`  对照·伤害最高：${b.items.join(" + ")} | ${fmtIns(b.ins)} | 卡住 ${b.hit} 个：${b.caps.map(([n, v, th]) => `${n.split("（")[0]} ${v.toFixed(1)}${v + 1e-9 >= th ? "✔" : "✘"}`).join("  ")}`);
    for (const r of L.top.slice(0, 3)) {
      console.log(`   伤害 ${(r.dmg / L.bestDmg * 100).toFixed(1)}%（相对全局最高）| ${r.items.join(" + ")} | ${fmtIns(r.ins)}`);
      console.log(`      ${r.caps.map(([n, v, th]) => `${n}：${v.toFixed(1)}${v + 1e-9 >= th ? "✔" : "✘"}`).join("  ")}`);
    }
  }
}
module.exports = { powerOf, recipe, planPurchaseInner, tierOf, fmtIns, insCandidates, joint, HEROES, total, derive, rawItems, rawIns, early, late, planPurchase, itemStats, INS };
