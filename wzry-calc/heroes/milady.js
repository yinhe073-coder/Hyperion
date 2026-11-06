// 王者荣耀出装计算器 —— 米莱狄数据（S45，2026-11）
//
// ⚠ 米莱狄能找到的数据比后羿少得多：机器人的成长系数、基础攻速、攻速档位都查不到。
// 下面带「待测」的数字都是占位估计值，只用来让模型跑起来。务必按网页上的「训练营测量清单」实测后替换。
// 已有来源支持的机制：
//   - 机器人的攻击、生命、移速随米莱狄「法术攻击」成长；不继承法穿、吸血
//   - 机器人存在 6 秒，同等级两两合体升级（最高 3 级，数量上限 4/2/1），每次合体攻击 +30%
//   - 自爆伤害 200/305/410 + 30% 法术攻击
//   - 二技能「强制入侵」开启后范围内机器人 +100% 攻速、+100% 移速
//   - 友方攻速光环对机器人生效（但极影现在是游走装，米莱狄自己买会失去经济）
//   - 机器人是否继承米莱狄自身攻速：来源矛盾，默认「不继承」，可在网页切换

(function () {
const DATA = {
  id: "milady",
  version: "S45（2026-11，大量数据待训练营实测）",

  hero: {
    name: "米莱狄",
    level: 15,
    growthPerLevel: 1,           // 每级攻速成长 %（待测）
    passiveStacks: 0, passivePerStack: 0,
    thresholds: [100],           // 米莱狄自身攻速档位：查不到，暂按 100% 上限（待测）
    maxThreshold: 100,
    baseAtk: 160, atkPerLevel: 10,   // 自身普攻（待测）
    heroApRatio: 0,              // 自身普攻吃多少法术攻击（待测）
    cdrCap: 40,                  // 冷却缩减上限 40%
    baseMs: 360,                 // 基础移速（待测）
  },

  model: {
    type: "summoner",            // 计算模型：召唤物拆塔（拆塔每秒伤害 = 机器人 + 米莱狄自己的普攻）
    baseInterval: 1.0,
    robot: {
      baseAtk: 137.1,            // 机器人每次攻击 120 + 17.1×英雄等级 + 25% 法术攻击（官网）
      atkPerLevel: 17.1,
      apRatio: 0.25,
      baseAps: 1.0,              // 机器人每秒攻击次数（待测）
      lifetime: 6,               // 存在时间（秒），来源：S37 改版
      cap: 4,                    // 场上最多 4 个 1 级机器人
      perCast: 2,                // 二技能每次召唤 2 个（官网）
      skillCd: 14,               // 每 16~12 秒储备一次（官网，取 14）
      mergeBonus: 0.15,          // 合体带来的平均攻击加成（合体 +30%，按一半时间是合体状态估算）
      explodeBase: 200, explodeRatio: 0.3,   // 自爆 200(1级) + 30% 法术攻击，来源：S37 改版
    },
    ult: { asBonus: 100, duration: 4, cd: 30 },
    // 打人模型：一套技能伤害 = 基础 + 每级成长 + 法强系数 × 法术攻击（全部待测，米莱狄技能系数查不到）
    // weight：0 = 只看拆塔，1 = 只看打人，0.5 = 两者各半（几何加权）
    pvp: { weight: 0, comboBase: 500, comboPerLevel: 40, comboRatio: 1.2, comboCd: 8, targetMr: 200 },   // 二技能：机器人 +100% 攻速；持续时间和冷却待测
    inheritHeroAS: false,        // 机器人是否继承米莱狄自身攻速（来源矛盾，待测）
    onHitOnTowers: false,        // 电刀 / 圣剑的普攻附加伤害对防御塔是否有效（待测）
    msValue: 0.3,                // 目标函数里 1% 移速折算成 0.3% 拆塔伤害（兼顾逃跑，可调；填 0 = 只看拆塔）
    targets: [{ name: "防御塔", hp: 7000, armor: 0, mr: 0 }],
    scenarios: [{}],
    // 时间轴（法师中路 / 对抗路经济略低于发育路）
    goldPerMin: 600, startGold: 0,
    levelCurve: [[0, 1], [1, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 12], [12, 13], [14, 14], [16, 15]],
    timeRange: [3, 20], timeStep: 0.5,
    timeWeights: [[0, 1.0], [8, 1.2], [16, 1.0]],
    defensive: ["辉月", "贤者的庇护"],
    insMin: {},
  },

  // ap=法术攻击 apPct=法术攻击加成% cdr=冷却缩减% as=攻速% ms=移速% msFlat=固定移速 allyAs=友方攻速光环%
  // mBase/mLvl=普攻附带法术伤害（每次平均） apOnHit=普攻附带 法术攻击×系数
  items: {
    // ↓ 全部来自王者营地装备库接口（data/camp-equip-2026-11-06.json），conf: high
    // 旧版的冰霜法杖、圣贤之书已不存在（对应 凝冰之息、贤者天书）；极影现在是游走装（买了不拿野怪/兵线经济），已移除
    "冷静之靴":   { price: 700,  cdr: 15, msFlat: 50, recipe: ["神速之靴(250)", "元流结晶(300)"], conf: "high", note: "召唤师技能冷却恢复 +10%~20%" },
    "秘法之靴":   { price: 700,  msFlat: 50, mpenFlat: 90, recipe: ["神速之靴(250)", "蓝宝石(275)"], conf: "high", note: "法穿 60~120（随等级，取 90）" },
    "疾步之靴":   { price: 700,  msFlat: 70, recipe: ["神速之靴(250)", "红玛瑙(300)"], conf: "high", note: "+300 生命；脱战 5 秒再 +35~70 移速" },
    "痛苦面具":   { price: 2080, ap: 100, cdr: 7.5, recipe: ["云灵木(840)", "急速铠甲(800)"], conf: "high", note: "+900 生命；技能命中后 3 秒内 4 次 3% 当前生命法伤" },
    "博学者之怒": { price: 2140, ap: 210, apPct: 30, recipe: ["大棒(820)"], conf: "high", note: "被动：法术攻击 +30%" },
    "日暮之流":   { price: 2040, ap: 160, cdr: 10, mpenFlat: 180, recipe: ["云灵木(840)", "圣者法典(800)"], conf: "high", note: "+500 生命；打英雄叠法穿 20~40 × 6 层（取 180）" },
    "梦魇之牙":   { price: 2050, ap: 220, cdr: 7.5, ms: 7.5, recipe: ["魔道之石(800)", "圣者法典(800)"], conf: "high", note: "被动：重伤" },
    "凝冰之息":   { price: 2100, ap: 180, cdr: 7.5, recipe: ["大棒(820)", "急速铠甲(800)"], conf: "high", note: "+500 生命；技能减速 + 每 3 秒额外 75~150+15% 法攻法伤" },
    "贤者天书":   { price: 2610, ap: 350, cdr: 10, recipe: ["大棒(820)", "圣者法典(800)"], conf: "high", note: "每 100 法攻 +0.5% 增伤减伤" },
    "回响之杖":   { price: 2050, ap: 220, ms: 7.5, recipe: ["魔道之石(800)", "大棒(820)"], conf: "high", note: "技能命中范围爆炸 140~280+28% 法攻（冷却 5 秒）" },
    "虚无法杖":   { price: 2040, ap: 210, cdr: 5, mpenPct: 45, recipe: ["云灵木(840)", "大棒(820)"], conf: "high", note: "+500 生命；45% 法穿（只加强米莱狄自己和自爆，机器人普攻不吃）" },
    "辉月":       { price: 2080, ap: 160, cdr: 7.5, recipe: ["血族之书(800)", "圣者法典(800)"], conf: "high", note: "12% 法术吸血；主动无敌 1.5 秒" },
    "炽热支配":   { price: 2040, ap: 150, ms: 7.5, recipe: ["血族之书(800)", "魔道之石(800)"], conf: "high", note: "低血量净化 + 护盾" },
    "金色圣剑":   { price: 2070, ap: 150, as: 20, ms: 7.5, apOnHit: 0.3, recipe: ["大棒(820)", "狂暴双刃(760)"], conf: "high",
                    note: "普攻 +60；叠满 2 层后普攻额外 30% 法攻法伤" },
    "闪电匕首":   { price: 2040, as: 35, ms: 7.5, mBase: 84.8, mLvl: 8.57, recipe: ["速击之枪(800)", "狂暴双刃(760)"], conf: "high",
                    note: "+40 物攻；普攻 40~80 法伤，每 3 次连锁闪电 160~400（已折算）" },
  },


  inscriptions: {
    red: {
      "梦魇": { ap: 4.2, mpenFlat: 2.4, conf: "medium" },
      "圣人": { ap: 5.3, conf: "medium" },
    },
    blue: {
      "狩猎": { as: 1, ms: 1, conf: "high" },
      "轮回": { ap: 2.4, conf: "medium" },
      "调和": { ms: 0.4, conf: "medium" },
    },
    green: {
      "献祭": { ap: 2.4, mpenFlat: 6.4, conf: "low" },
      "心眼": { as: 0.6, mpenFlat: 6.4, conf: "medium" },   // 「88 法穿」= 10 梦魇 + 10 心眼 反推
      "虚空": { cdr: 0.6, conf: "medium" },
    },
  },

  heroParams: [
    ["level", "等级", "high"],
    ["cdrCap", "冷却上限 %", "high"],
    ["baseMs", "基础移速", "low"],
    ["baseAtk", "自身 1 级攻击", "low"],
    ["heroApRatio", "自身普攻法强系数", "low"],
  ],
  modelParams: [
    ["robot.apRatio", "机器人法强系数（关键）", "low"],
    ["robot.baseAtk", "机器人 1 级攻击", "low"],
    ["robot.baseAps", "机器人每秒攻击次数", "low"],
    ["robot.perCast", "每次召唤个数", "low"],
    ["robot.skillCd", "召唤技能冷却（秒）", "low"],
    ["ult.duration", "二技能持续（秒）", "low"],
    ["ult.cd", "二技能冷却（秒）", "low"],
    ["inheritHeroAS", "机器人继承自身攻速（1=是 0=否）", "low"],
    ["onHitOnTowers", "普攻附加伤害对塔有效（1=是 0=否）", "low"],
    ["msValue", "1% 移速 = 多少 % 拆塔得分", "medium"],
    ["pvp.weight", "打人权重（0=只拆塔，1=只打人）", "medium"],
    ["pvp.comboRatio", "一套技能法强系数", "low"],
    ["pvp.targetMr", "目标法抗", "medium"],
  ],
  itemCols: ["price", "ap", "apPct", "cdr", "mpenFlat", "mpenPct", "as", "allyAs", "ms", "msFlat"],
  defaultBuild: ["冷静之靴", "日暮之流", "博学者之怒", "贤者天书", "回响之杖", "虚无法杖"],
  defaultIns: { "圣人": 10, "轮回": 10, "心眼": 10 },

  measure: [
    "机器人法强系数：不出装、不带铭文召唤机器人打木桩，记伤害 A；买一件已知法术攻击的装备（如 +240）再打，记伤害 B。系数 = (B − A) ÷ 240",
    "机器人吃不吃自身攻速：出闪电匕首前后，各数一次机器人 6 秒内打了几下。次数变多就把「继承自身攻速」改成 1",
    "普攻附加伤害打塔：开 1v1 自定义房间，出电刀打塔，看有没有额外的法术伤害数字。有就把「对塔有效」改成 1",
    "机器人持续时间和上限：官网写 8 秒、最多 5 个，S37 新闻写 6 秒、可合体（上限 4/2/1），召唤后计时看是哪种",
    "移速：分别穿冷静之靴和疾步之靴，看面板移速，修正两双鞋的数值",
  ],

  sources: [
    ["米莱狄机械仆从新增合成效果（腾讯新闻）", "https://news.qq.com/rain/a/20241010A07D3700"],
    ["S37 米莱狄机械仆从合体升级（搜狐）", "https://m.sohu.com/a/810255957_122003613"],
    ["S42赛季米莱狄该怎么玩（知乎）", "https://zhuanlan.zhihu.com/p/1888593821803210240"],
    ["为什么米莱狄要出极影（知乎）", "https://www.zhihu.com/question/348901039"],
    ["玩米莱狄的四个误区（CSDN）", "https://blog.csdn.net/weixin_34740753/article/details/112435538"],
    ["米莱狄6大技巧解析（新浪）", "https://www.sina.cn/news/detail/5293405154576505.html"],
    ["S40 法师装备改动：辉月（腾讯新闻）", "https://news.qq.com/rain/a/20250616A05TX700"],
    ["S40 装备调整一览：博学者之怒合成（逍遥软件站）", "https://down.xyzs.com/article/10082/"],
    ["金色圣剑（百度百科）", "https://baike.baidu.com/item/%E9%87%91%E8%89%B2%E5%9C%A3%E5%89%91/51136293"],
  ],
};

if (typeof module !== "undefined") module.exports = DATA;
else (window.HEROES = window.HEROES || {})[DATA.id] = DATA;
})();
