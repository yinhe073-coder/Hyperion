// 信号采集器：全部是无需登录/密钥的公开接口。
// 每条信号统一成：{ id, source, kind, title, text, url, engagement, createdAt }
//   kind = 'pain'  有人在喊需求/抱怨（需求侧信号）
//   kind = 'proof' 有东西正在被追捧（供给侧信号：可借鉴、本地化、切细分）

const UA = 'opportunity-radar/1.0';

async function get(url, as = 'json') {
  const headers = { 'User-Agent': UA, Accept: as === 'json' ? 'application/json' : '*/*' };
  if (url.startsWith('https://api.github.com') && process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  let res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (res.status === 401 && headers.Authorization) {
    // token 无效时退回匿名访问（匿名额度足够每天跑一次）
    delete headers.Authorization;
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === 'json' ? res.json() : res.text();
}

const strip = (html = '') =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim();

const clip = (s, n = 400) => (s.length > n ? s.slice(0, n) + '…' : s);

// 1) Hacker News 评论里的"求工具/愿意付费"句式 —— 最直接的需求信号
async function hnPainComments({ painPhrases, since }) {
  const out = [];
  for (const phrase of painPhrases) {
    const q = encodeURIComponent(`"${phrase}"`);
    const data = await get(
      `https://hn.algolia.com/api/v1/search_by_date?query=${q}&tags=comment&hitsPerPage=30&numericFilters=created_at_i>${since}`
    );
    for (const h of data.hits) {
      const text = strip(h.comment_text);
      // Algolia 会做模糊匹配，这里要求原句真的出现
      const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
      if (idx < 0) continue;
      // 只保留痛点句子附近的上下文
      const ctx = text.slice(Math.max(0, idx - 150), idx + 350);
      out.push({
        id: `hnc-${h.objectID}`,
        source: 'HN 评论',
        kind: 'pain',
        title: `「${phrase}…」 @ ${h.story_title || 'HN'}`,
        text: clip(ctx, 500),
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        engagement: 0,
        createdAt: h.created_at_i,
      });
    }
  }
  return out;
}

// 2) Ask HN：有热度的提问帖（"大家怎么解决 X"）
async function hnAsk({ since }) {
  const data = await get(
    `https://hn.algolia.com/api/v1/search?tags=ask_hn&hitsPerPage=40&numericFilters=created_at_i>${since},points>15`
  );
  return data.hits.map((h) => ({
    id: `hns-${h.objectID}`,
    source: 'Ask HN',
    kind: 'pain',
    title: h.title,
    text: clip(strip(h.story_text || '')),
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    engagement: (h.points || 0) + (h.num_comments || 0),
    createdAt: h.created_at_i,
  }));
}

// 3) Show HN：已被市场投票验证的新产品
async function hnShow({ since }) {
  const data = await get(
    `https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=40&numericFilters=created_at_i>${since},points>40`
  );
  return data.hits.map((h) => ({
    id: `hns-${h.objectID}`,
    source: 'Show HN',
    kind: 'proof',
    title: h.title,
    text: clip(strip(h.story_text || h.url || '')),
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    engagement: (h.points || 0) + (h.num_comments || 0),
    createdAt: h.created_at_i,
  }));
}

// 4) GitHub：两周内新建且 star 飙升的仓库
async function githubRising() {
  const d = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const data = await get(
    `https://api.github.com/search/repositories?q=created:%3E${d}+stars:%3E150&sort=stars&order=desc&per_page=30`
  );
  return data.items.map((r) => ({
    id: `gh-${r.id}`,
    source: 'GitHub 新星',
    kind: 'proof',
    title: `${r.full_name} ★${r.stargazers_count}`,
    text: clip(`${r.description || ''} [${r.language || '-'}] ${(r.topics || []).join(' ')}`),
    url: r.html_url,
    engagement: r.stargazers_count / 10,
    createdAt: Math.floor(new Date(r.created_at) / 1000),
  }));
}

// 招聘、闲聊类节点噪音大，直接跳过
const V2EX_SKIP_NODES = ['jobs', 'career', 'cv', 'life', 'all4all', 'deals', 'flamewar', 'invest', 'outsourcing', 'promotions', 'exchange'];

// 5) V2EX：中文技术社区的求助/吐槽/求推荐
async function v2ex({ v2exKeywords }) {
  const lists = await Promise.allSettled([
    get('https://www.v2ex.com/api/topics/hot.json'),
    get('https://www.v2ex.com/api/topics/latest.json'),
  ]);
  const topics = lists.flatMap((l) => (l.status === 'fulfilled' ? l.value : []));
  if (!topics.length) throw new Error('v2ex: 两个列表都失败');
  return topics
    .filter((t) => !V2EX_SKIP_NODES.includes(t.node?.name))
    .filter((t) => v2exKeywords.some((k) => (t.title + (t.content || '')).includes(k)))
    .map((t) => ({
      id: `v2-${t.id}`,
      source: `V2EX/${t.node?.title || t.node?.name || ''}`,
      kind: 'pain',
      title: t.title,
      text: clip(strip(t.content || '')),
      url: t.url,
      engagement: t.replies || 0,
      createdAt: t.created,
    }));
}

// 6) Product Hunt：每日新品（Atom feed）
async function productHunt() {
  const xml = await get('https://www.producthunt.com/feed', 'text');
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const pick = (re) => (e.match(re) || [])[1] || '';
    const content = strip(strip(pick(/<content[^>]*>([\s\S]*?)<\/content>/)));
    return {
      id: `ph-${pick(/<id>[^<]*Post\/(\d+)<\/id>/)}`,
      source: 'Product Hunt',
      kind: 'proof',
      title: strip(pick(/<title>([\s\S]*?)<\/title>/)),
      text: clip(content.replace(/Discussion \| Link$/, '').trim()),
      url: pick(/<link rel="alternate"[^>]*href="([^"]+)"/),
      engagement: 0,
      createdAt: Math.floor(new Date(pick(/<published>([^<]+)<\/published>/)) / 1000),
    };
  });
}

export async function collect(config) {
  const since = Math.floor(Date.now() / 1000) - config.lookbackDays * 86400;
  const ctx = { ...config, since };
  const jobs = { hnPainComments, hnAsk, hnShow, githubRising, v2ex, productHunt };
  const results = await Promise.allSettled(Object.values(jobs).map((fn) => fn(ctx)));
  const signals = [];
  const status = {};
  Object.keys(jobs).forEach((name, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      status[name] = r.value.length;
      signals.push(...r.value);
    } else {
      status[name] = `失败: ${r.reason.message}`;
    }
  });
  // 只要时间窗内的（GitHub 新星除外，它本身按 14 天建仓筛选）
  const fresh = signals.filter((s) => s.source === 'GitHub 新星' || s.createdAt >= since);
  return { signals: fresh, status };
}
