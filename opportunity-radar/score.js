// 规则打分（0-100）：不依赖任何模型，保证没有 API key 也能跑。
// 五个维度的权重在 config.json 的 weights 里调。

const PAIN = [
  'i wish', 'wish there', 'frustrat', 'annoying', 'pain', 'manually', 'by hand', 'tedious', 'hate',
  'no good', "can't find", 'cannot find', 'is there a', 'looking for', 'alternative to', 'every week', 'every day',
  'hours', 'spreadsheet', 'workaround', 'broken',
  '求', '有没有', '太麻烦', '麻烦', '手动', '痛点', '吐槽', '难用', '替代', '找不到', '每天', '每周', '浪费时间', '批量',
];
const MONEY = [
  'pay for', "i'd pay", 'would pay', 'paying', 'subscription', 'pricing', 'expensive', 'too pricey', 'budget',
  '$', 'saas', 'b2b', 'customers', 'clients', 'business', 'company', 'team', 'revenue', 'mrr', 'freelanc', 'agency',
  'invoice', 'enterprise',
  '付费', '收费', '愿意花钱', '太贵', '订阅', '客户', '公司', '企业', '老板', '外包', '接单', '变现', '赚钱', '报价', '预算',
];

const hits = (text, words) => words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
const sat = (n, full) => Math.min(1, n / full); // n 达到 full 即满分

export function scoreSignal(s, config) {
  const w = config.weights;
  const text = `${s.title} ${s.text}`.toLowerCase();
  const { fitKeywords, avoidKeywords } = config.profile;

  // 互动量：对数压缩，约 300 互动封顶；没有互动数据的来源给中性分
  const engagement = s.engagement > 0 ? Math.min(1, Math.log10(1 + s.engagement) / 2.5) : 0.35;
  const pain = Math.max(sat(hits(text, PAIN), 3), s.kind === 'pain' ? 0.4 : 0);
  const money = sat(hits(text, MONEY), 3);
  const fit = sat(hits(text, fitKeywords.map((k) => k.toLowerCase())), 2);
  const ageDays = (Date.now() / 1000 - s.createdAt) / 86400;
  const fresh = Math.max(0, 1 - ageDays / 14);

  let score =
    engagement * w.engagement + pain * w.pain + money * w.money + fit * w.fit + fresh * w.fresh;
  if (avoidKeywords.some((k) => text.includes(k.toLowerCase()))) score *= 0.3;

  return {
    ...s,
    score: Math.round(score),
    parts: {
      互动: Math.round(engagement * 100),
      痛感: Math.round(pain * 100),
      付费: Math.round(money * 100),
      匹配: Math.round(fit * 100),
    },
  };
}
