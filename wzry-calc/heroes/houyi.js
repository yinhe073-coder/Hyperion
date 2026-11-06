// 王者荣耀出装计算器 —— 后羿数据（S45，2026-10）
//
// 重要：截至 2026-10 没能找到官方公布的 S45 完整数值，下面每个数字都标了来源和可信度：
//   conf: "high"   多个来源一致，或可以由套装合计反推验证
//   conf: "medium" 有来源但版本较旧 / 只有单一来源
//   conf: "low"    来源互相矛盾，取了最可能的值，务必进训练营核对
// 网页上所有数值都可以直接改，版本更新时改这里或改网页输入框即可。

(function () {
const DATA = {
  id: "houyi",
  version: "S45（2026-10，数据待训练营核对）",

  hero: {
    name: "后羿",
    level: 15,
    // 每级 +1% 攻速成长（1 级为 0），15 级 = 14%。来源：2022/2023 多篇攻略。
    growthPerLevel: 1, growthConf: "medium",
    // 被动「惩戒射击」：普攻叠攻速，最多 3 层。2025-04 改为随等级成长，满级满层取 30%。
    passiveStacks: 3, passivePerStack: 4, passiveConf: "medium",   // 官网：每层 +4% 攻速，3 层 12%
    // 后羿实际攻速上限档位：153.2%（两篇攻略分别写 153.2% / 153%~154%；S44 文章称「开启逐日后满阈值」）
    maxThreshold: 153.2, maxThresholdConf: "medium",
    // 中间档位：当前版本没有可靠数据。留空时只按最高档位计算。
    // 可以把 B 站 / 实测得到的档位表粘贴进网页输入框，例如 "16.8,27.4,38,52,76,116.5,153.2"
    thresholds: [153.2],
    // 物攻：1 级约 170，每级 +13.8（15 级约 363）。只影响装备物攻占比，conf: low
    baseAtk: 170, atkPerLevel: 13.8, atkConf: "low",
  },

  // 每秒伤害模型参数（只用来比较方案，绝对值无意义）
  model: {
    baseInterval: 1.0,          // 基础攻击间隔（秒），对比方案时会被约掉
    armorConst: 602,            // 减伤 = 护甲 / (护甲 + 602)
    avgHpRatio: 0.6,            // 末世按目标「当前生命」算，取平均剩 60% 血
    // 目标：脆皮 C 位 和 前排坦克，各占一半
    targets: [
      { name: "脆皮", hp: 3500, bonusHp: 800, armor: 350, mr: 250 },
      { name: "坦克", hp: 7500, bonusHp: 4000, armor: 750, mr: 450 },
    ],
    // 被动每层攻速两种假设一起算（10% 是默认值，7% 对应「三连射后降 9%」的说法），保证结论两边都成立
    passiveScenarios: [4],      // 官网被动：每层 4%
    // 时间轴模型：按经济推算每个时刻买了哪些装备、多少级，再把整局每秒伤害取平均（装备价格自然计入）
    goldPerMin: 650,            // 发育路平均每分钟经济（估计值，可改）
    startGold: 0,               // 开局金币（出门装另算，忽略）
    // 等级曲线 [分钟, 等级]，中间线性插值
    levelCurve: [[0, 1], [1, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 12], [12, 13], [14, 14], [16, 15]],
    timeRange: [3, 20],         // 只统计第 3～20 分钟
    timeStep: 0.25,             // 每 15 秒采样一次
    // 时间权重 [起始分钟, 权重]：中期团战（8～16 分钟）最重要
    timeWeights: [[0, 0.7], [8, 1.2], [16, 1.0]],
    type: "adc",                // 计算模型：普攻射手（每秒伤害 = 攻速 × 普攻伤害）
    defensive: ["贤者的庇护"],
    insMin: { "夺萃": 3 },      // 国服后羿都带 3~4 夺萃，默认至少 3 颗
  },

  // 装备：as=攻速%  atk=物攻  crit=暴击率%  critDmg=暴击效果%  ls=物理吸血%  ms=移速%  pen=护甲穿透%
  // recipe: 合成所需小件（价格为单件售价）
  items: {
    // ↓ 全部来自王者营地装备库接口（kohcamp.qq.com，2026-11-06 抓取），conf: high
    // 远程英雄翻倍的被动已按后羿（远程）折算
    "急速战靴":   { price: 700,  as: 20, recipe: ["神速之靴(250)", "匕首(300)"], conf: "high",
                    note: "被动：+50 移速；普攻回血 30~60（远程）" },
    "影刃":       { price: 2040, atk: 45, as: 35, crit: 20, ms: 7.5, asOnHit: 10, recipe: ["雷鸣刃(820)", "狂暴双刃(760)"], conf: "high",
                    note: "被动：普攻命中 +10% 攻速、+5% 移速（3 秒，暴击后翻倍），按「持续攻击时 10%×(1+暴击率)」计入" },
    "无尽战刃":   { price: 2060, atk: 120, crit: 20, critDmgDyn: 1, recipe: ["风暴巨剑(850)", "雷鸣刃(820)"], conf: "high",
                    note: "被动：+20% 暴击效果，每 2% 暴击率再 +1%（最多 +50%）" },
    "仁者破晓":   { price: 2500, atk: 75, as: 30, crit: 15, pen: 30, onHitFlat: 50, recipe: ["穿云弓(800)", "速击之枪(800)"], conf: "high",
                    note: "被动：15% 物理穿透、+25 普攻伤害（远程翻倍 → 30%、+50）" },
    "逐日之弓":   { price: 2100, atk: 40, as: 20, crit: 15, ms: 7.5, onHitFlat: 50, recipe: ["穿云弓(800)", "迅捷长矛(760)"], conf: "high",
                    note: "被动：+25 普攻伤害（远程翻倍 → +50）；主动：+125 射程、+20% 移速 5 秒（冷却 75 秒）" },
    "末世":       { price: 2100, atk: 40, as: 20, ls: 20, hp: 500, pBase: 74.3, pLvl: 5.71, pctBonusHp: 7, recipe: ["血魂刃(800)", "精钢锻刀(850)"], conf: "high",
                    note: "被动：普攻额外 80~160（随等级）+ 目标额外生命 7% 物理伤害" },
    "闪电匕首":   { price: 2040, atk: 40, as: 35, ms: 7.5, mBase: 84.8, mLvl: 8.57, recipe: ["速击之枪(800)", "狂暴双刃(760)"], conf: "high",
                    note: "被动：普攻 40~80 法伤，每 3 次连锁闪电 160~400（已折算成每次平均）" },
    "泣血之刃":   { price: 2020, atk: 80, ls: 25, hp: 500, recipe: ["血魂刃(800)", "日冕(760)"], conf: "high", note: "被动：25% 物理技能吸血" },
    "制裁之刃":   { price: 2080, atk: 75, as: 30, ls: 20, recipe: ["血魂刃(800)", "速击之枪(800)"], conf: "high", note: "被动：普攻和技能附带重伤" },
    "幽影袖箭":   { price: 2040, atk: 40, as: 20, crit: 20, hp: 650, recipe: ["穿云弓(800)", "日冕(760)"], conf: "high", note: "主动：隐身 2.5 秒 + 30% 移速" },
    "强者破军":   { price: 2540, atk: 150, cdr: 5, execute: 30, recipe: ["风暴巨剑(850)"], conf: "high", note: "被动：对生命低于 50% 的敌人 +30% 伤害（按一半时间生效估算）" },
    "名刀·司命":  { price: 2060, atk: 75, as: 15, hp: 500, recipe: ["风暴巨剑(850)", "精钢锻刀(850)"], conf: "high", note: "被动：致命伤害时短暂无敌" },
    "贤者的庇护": { price: 2280, hp: 900, cdr: 5, recipe: ["天地石(800)", "力量腰带(850)"], conf: "high", note: "被动：死亡后 2 秒原地复活" },
    "影忍之足":   { price: 690,  recipe: ["神速之靴(250)", "布甲"], conf: "medium", note: "物理减伤鞋，不加攻速" },
  },


  // 铭文：每颗数值。由「10红月10鹰眼10狩猎 = 攻速26% 物攻9 暴击5% 物穿64 移速10%」等套装合计反推。
  inscriptions: {
    red: {
      "红月": { as: 1.6, crit: 0.5, conf: "high" },
      "祸源": { crit: 1.6, conf: "high" },
      "无双": { crit: 0.7, critDmg: 3.6, conf: "high" },
      "异变": { atk: 2, penFlat: 3.6, conf: "high" },
    },
    blue: {
      "狩猎": { as: 1, ms: 1, conf: "high" },
      "夺萃": { ls: 1, conf: "high" },
      "隐匿": { atk: 1.6, ms: 1, conf: "high" },
    },
    green: {
      "鹰眼": { atk: 0.9, penFlat: 6.4, conf: "high" },
    },
  },

  // 网页上显示的可调参数 [字段, 名称, 可信度]
  heroParams: [
    ["level", "等级", "high"],
    ["growthPerLevel", "每级攻速成长 %", "medium"],
    ["passivePerStack", "被动每层攻速 %", "low"],
    ["passiveStacks", "被动层数（0~3）", "high"],
    ["baseAtk", "1 级物攻", "low"],
    ["atkPerLevel", "每级物攻成长", "low"],
  ],
  // 装备数值表显示的列
  itemCols: ["price", "as", "atk", "crit", "ls", "pen", "onHitFlat", "ms"],
  defaultBuild: ["急速战靴", "影刃", "无尽战刃", "仁者破晓", "末世", "贤者的庇护"],
  defaultIns: { "无双": 10, "鹰眼": 10, "隐匿": 7, "夺萃": 3 },

  sources: [
    ["王者营地 后羿大神出装与装备库（2026-11-06）", "https://camp.qq.com/h5/webdist/equip-share/index.html?heroId=169"],
    ["后羿极限攻速阈值153%、三连射后降9%攻速（超凡）", "https://www.chaofan.com/news/lnxs5c3som76u7e.html"],
    ["S44 后羿出装铭文汇总：攻速阈值调整（搜狐）", "https://m.sohu.com/a/1033952540_122725641"],
    ["S44 正式服射手攻速装备调整（搜狐）", "https://www.sohu.com/a/1028042618_122722145"],
    ["S44 全射手出装铭文汇总（搜狐）", "https://www.sohu.com/a/1025839376_122722085"],
    ["S45 射手梯度（搜狐）", "https://www.sohu.com/a/1036247568_122724495"],
    ["S40 装备改动一览（玩一玩）", "https://www.wywyx.com/news/202507/509289.html"],
    ["S40 装备调整（腾讯新闻）", "https://news.qq.com/rain/a/20250703A03M8A00"],
    ["速击之枪（百度百科）", "https://baike.baidu.com/item/%E9%80%9F%E5%87%BB%E4%B9%8B%E6%9E%AA/22854794"],
    ["闪电匕首（百度百科）", "https://baike.baidu.com/item/%E9%97%AA%E7%94%B5%E5%8C%95%E9%A6%96/18878310"],
    ["破晓（百度百科）", "https://baike.baidu.com/item/%E7%A0%B4%E6%99%93/22465171"],
    ["正确卡攻速阈值（小米游戏中心，2022）", "https://game.xiaomi.com/viewpoint/1401739964_1670815911800_100"],
    ["S45 正式服 9.23 更新（腾讯新闻）", "https://news.qq.com/rain/a/20260918A0AVLR00"],
  ],
};

if (typeof module !== "undefined") module.exports = DATA;
else (window.HEROES = window.HEROES || {})[DATA.id] = DATA;
})();
