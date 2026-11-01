// 王者荣耀出装计算器 —— 米莱狄数据（S45，2026-11）
//
// ⚠ 米莱狄能找到的数据比后羿少得多：机器人的成长系数、基础攻速、攻速档位都查不到。
// 下面带「待测」的数字都是占位估计值，只用来让模型跑起来。务必按网页上的「训练营测量清单」实测后替换。
// 已有来源支持的机制：
//   - 机器人的攻击、生命、移速随米莱狄「法术攻击」成长；不继承法穿、吸血
//   - 机器人存在 6 秒，同等级两两合体升级（最高 3 级，数量上限 4/2/1），每次合体攻击 +30%
//   - 自爆伤害 200/305/410 + 30% 法术攻击
//   - 二技能「强制入侵」开启后范围内机器人 +100% 攻速、+100% 移速
//   - 极影等友方攻速光环对机器人生效
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
      baseAtk: 60,               // 机器人 1 级攻击（待测）
      atkPerLevel: 6,            // 每级成长（待测）
      apRatio: 0.25,             // 每点法术攻击给机器人加多少攻击（待测，关键参数）
      baseAps: 1.0,              // 机器人每秒攻击次数（待测）
      lifetime: 6,               // 存在时间（秒），来源：S37 改版
      cap: 4,                    // 场上最多 4 个 1 级机器人
      perCast: 2,                // 一技能每次召唤几个（待测）
      skillCd: 8,                // 召唤技能基础冷却（秒，待测）
      mergeBonus: 0.15,          // 合体带来的平均攻击加成（合体 +30%，按一半时间是合体状态估算）
    },
    ult: { asBonus: 100, duration: 4, cd: 30 },   // 二技能：机器人 +100% 攻速；持续时间和冷却待测
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
    defensive: ["辉月"],
    insMin: {},
  },

  // ap=法术攻击 apPct=法术攻击加成% cdr=冷却缩减% as=攻速% ms=移速% msFlat=固定移速 allyAs=友方攻速光环%
  // mBase/mLvl=普攻附带法术伤害（每次平均） apOnHit=普攻附带 法术攻击×系数
  items: {
    "冷静之靴":   { price: 710,  cdr: 15, msFlat: 60, recipe: ["神速之靴(250)"], conf: "medium", note: "移速数值待核对" },
    "疾步之靴":   { price: 710,  msFlat: 90, recipe: ["神速之靴(250)"], conf: "low", note: "纯移速鞋，数值待核对" },
    "痛苦面具":   { price: 2040, ap: 140, cdr: 5, recipe: [], conf: "low", note: "法穿对机器人无效" },
    "博学者之怒": { price: 2300, ap: 240, apPct: 35, recipe: ["大棒", "大棒"], conf: "low", note: "被动：法术攻击 +35%（旧版本数值）；S40 合成路径 大棒+大棒" },
    "日暮之流":   { price: 2100, ap: 160, cdr: 10, recipe: [], conf: "low", note: "" },
    "梦魇之牙":   { price: 2100, ap: 140, cdr: 10, recipe: [], conf: "low", note: "" },
    "冰霜法杖":   { price: 2100, ap: 150, recipe: [], conf: "low", note: "技能减速，逃跑用" },
    "虚无法杖":   { price: 2110, ap: 240, recipe: [], conf: "low", note: "法穿对机器人无效，只加强米莱狄自己" },
    "圣贤之书":   { price: 2990, ap: 400, recipe: [], conf: "low", note: "" },
    "辉月":       { price: 2100, ap: 160, cdr: 7.5, recipe: ["血族之书", "圣者法典(800)"], conf: "medium", note: "S40：冷却 10%→7.5%，售价 2100，新增 12% 法术吸血；主动短暂无敌" },
    "金色圣剑":   { price: 2050, ap: 160, as: 20, ms: 5, apOnHit: 0.25, recipe: ["元素杖", "速击之枪(880)"], conf: "low",
                    note: "2020 年数值；被动叠满后普攻附带 0.25×法术攻击 法伤" },
    "闪电匕首":   { price: 1840, as: 35, ms: 8, mBase: 86.7, mLvl: 9.67, recipe: ["速击之枪(880)", "匕首(290)"], conf: "low",
                    note: "法球：每次普攻 40+3×等级，每 3 次 140+20×等级（已折算）" },
    "极影":       { price: 2000, as: 20, allyAs: 30, recipe: [], conf: "low", note: "友方攻速光环，对机器人生效（光环数值待测）" },
  },

  inscriptions: {
    red: {
      "梦魇": { ap: 4.2, conf: "medium" },
      "圣人": { ap: 5.3, conf: "medium" },
    },
    blue: {
      "狩猎": { as: 1, ms: 1, conf: "high" },
      "轮回": { ap: 2.4, conf: "medium" },
      "调和": { ms: 0.4, conf: "medium" },
    },
    green: {
      "献祭": { ap: 2.4, conf: "low" },
      "心眼": { as: 0.6, conf: "low" },
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
  ],
  itemCols: ["price", "ap", "apPct", "cdr", "as", "allyAs", "ms", "msFlat"],
  defaultBuild: ["冷静之靴", "博学者之怒", "日暮之流", "极影", "痛苦面具", "辉月"],
  defaultIns: { "圣人": 10, "狩猎": 10, "虚空": 10 },

  measure: [
    "机器人法强系数：不出装、不带铭文召唤机器人打木桩，记伤害 A；买一件已知法术攻击的装备（如 +240）再打，记伤害 B。系数 = (B − A) ÷ 240",
    "机器人吃不吃自身攻速：出闪电匕首前后，各数一次机器人 6 秒内打了几下。次数变多就把「继承自身攻速」改成 1",
    "普攻附加伤害打塔：开 1v1 自定义房间，出电刀打塔，看有没有额外的法术伤害数字。有就把「对塔有效」改成 1",
    "极影光环：带极影和不带各数一次机器人打几下，算出实际攻速加成",
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
