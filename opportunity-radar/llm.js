// 可选的 AI 评估层：设置了 ANTHROPIC_API_KEY 才启用。
// 把规则打分的前 N 条交给 Claude，按"一个人能不能在 48 小时内验证"来判断，
// 并给出具体的最小验证动作。失败时静默退回规则打分，不影响日报产出。

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'verdict', 'score', 'opportunity', 'who_pays', 'mvp_48h', 'first_step', 'risk'],
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['做', '观察', '放弃'] },
          score: { type: 'integer', description: '0-100 综合分' },
          opportunity: { type: 'string', description: '一句话：这里的赚钱机会是什么' },
          who_pays: { type: 'string', description: '谁付钱、大概愿意付多少' },
          mvp_48h: { type: 'string', description: '48 小时内能做出的最小可卖版本' },
          first_step: { type: 'string', description: '今天就能做的第一个验证动作' },
          risk: { type: 'string', description: '最可能让它失败的一个原因' },
        },
      },
    },
  },
};

const SYSTEM = `你是一位务实的独立开发者商业顾问。用户会给你一批从公开社区抓到的信号（有人喊需求，或者某个新产品正在走红）。
逐条判断它对"这位用户"是不是值得动手验证的赚钱机会。

判断标准，按重要性排序：
1. 需求是否真实且反复出现（一个人的随口抱怨不算）。
2. 是否有明确的付钱方，以及他们现在是否已经在为替代方案花钱或花时间。
3. 这位用户能否在 48 小时内做出一个可以收钱或可以收集预订的最小版本。
4. 是否能找到具体的获客渠道（发在哪、找谁）。

对走红的新产品（kind=proof），思考的是：能否切一个更小的细分人群、做中文/本地化版本、做配套工具或服务，而不是原样照抄。
宁可严格：大多数信号应该是"观察"或"放弃"，只有真正满足上面几条的才给"做"。
所有输出用简体中文，每个字段一两句话，具体到可以直接照做，不要空话。`;

export async function llmEvaluate(candidates, config) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    console.warn('未安装 @anthropic-ai/sdk（先 npm install），跳过 AI 评估');
    return null;
  }
  const client = new Anthropic();
  const payload = candidates.map(({ id, source, kind, title, text, engagement }) => ({
    id, source, kind, title, text, engagement: Math.round(engagement),
  }));

  try {
    const res = await client.beta.messages.create({
      model: process.env.RADAR_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      // 模型因安全策略拒答时，由服务端自动换模型重跑
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `用户画像：${config.profile.about}\n\n待评估信号（JSON）：\n${JSON.stringify(payload, null, 1)}`,
        },
      ],
    });
    if (res.stop_reason !== 'end_turn') throw new Error(`stop_reason=${res.stop_reason}`);
    const text = res.content.find((b) => b.type === 'text')?.text;
    const map = new Map();
    for (const it of JSON.parse(text).items) map.set(it.id, it);
    return map;
  } catch (e) {
    console.warn(`AI 评估失败，退回规则打分：${e.message}`);
    return null;
  }
}
