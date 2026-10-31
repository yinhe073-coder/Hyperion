// 后羿攻速阈值计算器 —— 数据表（S45，2026-10）
//
// 重要：截至 2026-10 没能找到官方公布的 S45 完整数值，下面每个数字都标了来源和可信度：
//   conf: "high"   多个来源一致，或可以由套装合计反推验证
//   conf: "medium" 有来源但版本较旧 / 只有单一来源
//   conf: "low"    来源互相矛盾，取了最可能的值，务必进训练营核对
// 网页上所有数值都可以直接改，版本更新时改这里或改网页输入框即可。

const DATA = {
  version: "S45（2026-10，数据待训练营核对）",

  hero: {
    name: "后羿",
    level: 15,
    // 每级 +1% 攻速成长（1 级为 0），15 级 = 14%。来源：2022/2023 多篇攻略。
    growthPerLevel: 1, growthConf: "medium",
    // 被动「惩戒射击」：普攻叠攻速，最多 3 层。2025-04 改为随等级成长，满级满层取 30%。
    passiveStacks: 3, passivePerStack: 10, passiveConf: "low",
    // 后羿实际攻速上限档位：153.2%（两篇攻略分别写 153.2% / 153%~154%；S44 文章称「开启逐日后满阈值」）
    maxThreshold: 153.2, maxThresholdConf: "medium",
    // 中间档位：当前版本没有可靠数据。留空时只按最高档位计算。
    // 可以把 B 站 / 实测得到的档位表粘贴进网页输入框，例如 "16.8,27.4,38,52,76,116.5,153.2"
    thresholds: [153.2],
  },

  // 装备：as=攻速%  atk=物攻  crit=暴击率%  critDmg=暴击效果%  ls=物理吸血%  ms=移速%  pen=护甲穿透%
  // recipe: 合成所需小件（价格为单件售价）
  items: {
    "急速战靴":   { price: 710,  as: 25, ms: 0, recipe: ["神速之靴(250)", "匕首(290)"], conf: "medium",
                    note: "鞋子保留被动（S40 只删了 2 级装被动，鞋子除外）" },
    "闪电匕首":   { price: 1840, as: 35, ms: 8, recipe: ["速击之枪(880)", "匕首(290)"], conf: "low",
                    note: "改版后移除暴击，面板 +35%攻速 +8%移速；S44 有文章称降到 25%，说法矛盾。配方待核对" },
    "无尽战刃":   { price: 2140, atk: 130, crit: 20, critDmg: 50, recipe: ["风暴巨剑(910)", "雷鸣刃"], conf: "medium",
                    note: "S40 合成路径改为 风暴巨剑+雷鸣刃；旧配方 风暴巨剑+铁剑+搏击拳套。物攻有 120/130 两种说法" },
    "破晓":       { price: 3400, atk: 75, as: 35, crit: 15, pen: 40, recipe: ["穿云弓", "速击之枪(880)", "冲能拳套"], conf: "low",
                    note: "S40：物攻 90→75，暴击 10%→15%（较可靠）；攻速 35% 是旧版本数值" },
    "逐日之弓":   { price: 2100, atk: 40, as: 20, crit: 15, ms: 7.5, recipe: ["速击之枪(880)", "冲能拳套"], conf: "medium",
                    note: "S40 正式服：攻击 50→40，暴击 10→15%，攻速 25→20%，移速 5→7.5%，售价 2100。配方待核对" },
    "影刃":       { price: 2070, as: 25, crit: 15, recipe: ["速击之枪(880)", "冲能拳套"], conf: "low",
                    note: "被动暴击后额外加攻速（S44 称 40%/1.5 秒，不计入常驻面板）。数值来源矛盾" },
    "末世":       { price: 2160, atk: 60, as: 30, ls: 10, recipe: ["速击之枪(880)", "吸血之镰", "铁剑(275)"], conf: "low",
                    note: "S40 起 金刚钻刀 也可以合成末世" },
    "泣血之刃":   { price: 1740, atk: 100, ls: 25, recipe: ["吸血之镰", "大棒/风暴巨剑"], conf: "low", note: "" },
    "名刀·司命":  { price: 1760, atk: 60, recipe: ["风暴巨剑(910)", "布甲"], conf: "low", note: "保命，残血免死" },
    "贤者的庇护": { price: 2080, recipe: ["守护者之铠", "力量腰带"], conf: "low", note: "保命，复活" },
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

  sources: [
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
