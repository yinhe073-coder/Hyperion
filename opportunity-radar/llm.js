// AI 评估层。两种用法产出同一种文件 data/evaluation.json（runId 需与 data/candidates.json 一致）：
//   1) 设置 ANTHROPIC_API_KEY：由本文件调用 Claude API 自动生成（GitHub Actions 定时任务走这条路）
//   2) 不设置密钥：由 Claude Code 按 .claude/skills/opportunity-radar 的说明直接写出该文件
// 文件格式由 validateEvaluations 校验，两条路共用。

export const KIT_FIELDS = ['slug', 'name', 'headline', 'subhead', 'bullets', 'price', 'cta', 'audience', 'channels', 'post_title', 'post_body', 'reply_draft', 'dm_draft'];
const EVAL_FIELDS = ['id', 'verdict', 'score', 'opportunity', 'who_pays', 'mvp_48h', 'first_step', 'risk'];
const VERDICTS = ['做', '观察', '放弃'];

export function validateEvaluations(obj, candidateIds) {
  const errs = [];
  if (!obj || !Array.isArray(obj.items)) throw new Error('评估文件必须是 { "items": [...] }');
  const ids = new Set(candidateIds);
  const slugs = new Set();
  obj.items.forEach((it, i) => {
    const at = `items[${i}]${it?.id ? `(${it.id})` : ''}`;
    for (const f of EVAL_FIELDS) if (it[f] === undefined || it[f] === '') errs.push(`${at} 缺少 ${f}`);
    if (it.id && !ids.has(it.id)) errs.push(`${at} 的 id 不在候选列表里`);
    if (!VERDICTS.includes(it.verdict)) errs.push(`${at} verdict 必须是 ${VERDICTS.join('/')}`);
    if (!Number.isInteger(it.score) || it.score < 0 || it.score > 100) errs.push(`${at} score 必须是 0-100 的整数`);
    if (it.kit) {
      if (it.verdict !== '做') errs.push(`${at} 只有 verdict=做 才能带 kit`);
      for (const f of KIT_FIELDS) if (!it.kit[f] || it.kit[f].length === 0) errs.push(`${at}.kit 缺少 ${f}`);
      if (!/^[a-z0-9-]{3,40}$/.test(it.kit.slug || '')) errs.push(`${at}.kit.slug 只能是 3-40 位小写字母、数字、连字符`);
      if (slugs.has(it.kit.slug)) errs.push(`${at}.kit.slug 重复`);
      slugs.add(it.kit.slug);
      if (!Array.isArray(it.kit.bullets) || it.kit.bullets.length < 3 || it.kit.bullets.length > 5) errs.push(`${at}.kit.bullets 需要 3-5 条`);
      if (!Array.isArray(it.kit.channels)) errs.push(`${at}.kit.channels 必须是数组`);
    }
  });
  if (errs.length) throw new Error('评估文件不合格：\n  - ' + errs.join('\n  - '));
  return obj;
}

const str = (description) => ({ type: 'string', description });

const EVAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: EVAL_FIELDS,
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: VERDICTS },
          score: { type: 'integer', description: '0-100 综合分' },
          opportunity: str('一句话：这里的赚钱机会是什么'),
          who_pays: str('谁付钱、大概愿意付多少'),
          mvp_48h: str('48 小时内能做出的最小可卖版本'),
          first_step: str('今天就能做的第一个验证动作'),
          risk: str('最可能让它失败的一个原因'),
        },
      },
    },
  },
};

const KIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kits'],
  properties: {
    kits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', ...KIT_FIELDS],
        properties: {
          id: str('对应信号的 id'),
          slug: str('网址用的短名：3-40 位小写英文字母、数字、连字符'),
          name: str('产品或服务的名字'),
          headline: str('落地页主标题：一句话说清给谁解决什么问题'),
          subhead: str('副标题：一两句话补充怎么解决'),
          bullets: { type: 'array', items: { type: 'string' }, description: '3-5 条具体好处' },
          price: str('计划定价，例如「计划定价：每月 29 元」'),
          cta: str('按钮文字，例如「加入候补名单」'),
          audience: str('适合谁'),
          channels: { type: 'array', items: { type: 'string' }, description: '2-4 个适合发帖的具体社群或版块' },
          post_title: str('社群发帖标题'),
          post_body: str('社群发帖正文，用 {{LINK}} 代表落地页链接'),
          reply_draft: str('回复原帖的草稿，先回应对方的问题再提方案'),
          dm_draft: str('私信模板，简短、不推销、先问对方现在怎么解决'),
        },
      },
    },
  },
};

export const EVAL_GUIDE = `逐条判断它对"这位用户"是不是值得动手验证的赚钱机会。

判断标准，按重要性排序：
1. 需求是否真实且反复出现（一个人的随口抱怨不算）。
2. 是否有明确的付钱方，以及他们现在是否已经在为替代方案花钱或花时间。
3. 这位用户能否在 48 小时内做出一个可以收钱或可以收集预订的最小版本。
4. 是否能找到具体的获客渠道（发在哪、找谁）。

对走红的新产品（kind=proof），思考的是：能否切一个更小的细分人群、做中文/本地化版本、做配套工具或服务，而不是原样照抄。
宁可严格：大多数信号应该是"观察"或"放弃"，每天"做"不超过 2 条，没有就一条都不给。
所有输出用简体中文，每个字段一两句话，具体到可以直接照做，不要空话。`;

export const KIT_GUIDE = `为每个机会写一套"预约验证"素材：一个落地页的文案，加上三份发帖草稿。

要求：
- 这是产品做出来之前的预约页。不要写成产品已经存在，不要编造用户数、好评、案例或任何数据。
- 标题说人话：给谁、解决什么问题。不要口号和形容词堆砌。
- 定价给一个具体数字，并说明是计划定价。
- 发帖草稿要像一个真人在分享和征求意见，先讲问题和自己的做法，再给链接；不要写成广告。正文里用 {{LINK}} 代表落地页链接。
- 回复原帖的草稿要先真正回应对方说的问题。
- 私信模板要短，先问对方现在是怎么解决的，不要一上来推销。
- 渠道写具体的社群或版块名。`;

async function call(schema, system, user) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: process.env.RADAR_MODEL || 'claude-opus-5-5',
    max_tokens: 16000,
    // 模型因安全策略拒答时，由服务端自动换模型重跑
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason !== 'end_turn') throw new Error(`stop_reason=${res.stop_reason}`);
  return JSON.parse(res.content.find((b) => b.type === 'text').text);
}

const brief = ({ id, source, kind, title, text, url, engagement }) => ({ id, source, kind, title, text, url, engagement: Math.round(engagement) });

// 返回 { evaluator, items } 或 null（没有密钥 / 调用失败）
export async function llmEvaluate(candidates, config) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const profile = `用户画像：${config.profile.about}`;
    const { items } = await call(
      EVAL_SCHEMA,
      `你是一位务实的独立开发者商业顾问。用户会给你一批从公开社区抓到的信号（有人喊需求，或者某个新产品正在走红）。\n${EVAL_GUIDE}`,
      `${profile}\n\n待评估信号（JSON）：\n${JSON.stringify(candidates.map(brief), null, 1)}`
    );
    const go = items
      .filter((it) => it.verdict === '做')
      .sort((a, b) => b.score - a.score)
      .slice(0, config.maxKitsPerDay);
    if (go.length) {
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const { kits } = await call(
        KIT_SCHEMA,
        `你是一位擅长写朴素、可信文案的独立开发者。\n${KIT_GUIDE}`,
        `${profile}\n\n要准备素材的机会（JSON）：\n${JSON.stringify(go.map((it) => ({ ...it, signal: brief(byId.get(it.id)) })), null, 1)}`
      );
      for (const { id, ...kit } of kits) {
        const it = go.find((x) => x.id === id);
        if (it) it.kit = kit;
      }
    }
    return { evaluator: 'claude-api', items };
  } catch (e) {
    console.warn(`AI 评估失败，退回规则打分：${e.message}`);
    return null;
  }
}
