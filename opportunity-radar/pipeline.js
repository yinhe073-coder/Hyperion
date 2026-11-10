// 实验流水线：草稿 → 批准上线 → 统计线索 → 48 小时后自动下结论
// 状态存在 data/pipeline.json，每个实验一条：
//   { slug, id, name, title, url, status, createdAt, approvedAt, deadline, extended, leads, paid, verdict, verdictAt }
//   status: draft(待批准) | live(验证中) | scale(放大) | stopped(已停) | expired(草稿过期)

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync, appendFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { siteIndex } from './landing.js';

// 测试时可用 RADAR_NOW=2026-11-14T00:00:00Z 模拟时间流逝
export const now = () => (process.env.RADAR_NOW ? new Date(process.env.RADAR_NOW) : new Date());
export const dateCN = (d = now()) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);

const HOUR = 3600e3;

export function loadPipeline(root) {
  const p = join(root, 'data', 'pipeline.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}
export function savePipeline(root, pipeline) {
  writeFileSync(join(root, 'data', 'pipeline.json'), JSON.stringify(pipeline, null, 2) + '\n');
}

export function rebuildSiteIndex(root, pipeline) {
  const live = Object.values(pipeline).filter((e) => e.status === 'live' || e.status === 'scale');
  // 从没上线过任何页面时不创建 site/，避免触发无意义的发布
  if (!live.length && !existsSync(join(root, 'site'))) return;
  mkdirSync(join(root, 'site'), { recursive: true });
  writeFileSync(join(root, 'site', 'index.html'), siteIndex(live));
}

// ---------- 批准上线 ----------
export function approve(root, config, slugs) {
  const { formAction, contactEmail } = config.landing;
  if (!formAction && !contactEmail) {
    throw new Error(
      '还没有配置收集线索的方式：请在 config.json 的 landing.formAction（表单后端地址）或 landing.contactEmail 里至少填一个，然后运行 node radar.js rebuild 再批准。'
    );
  }
  const pipeline = loadPipeline(root);
  const done = [];
  for (const slug of slugs) {
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) throw new Error(`非法的 slug：${slug}`);
    const e = pipeline[slug];
    if (!e) throw new Error(`找不到实验：${slug}（可用：${Object.keys(pipeline).join(', ') || '无'}）`);
    if (e.status !== 'draft') {
      console.log(`${slug} 当前状态是 ${e.status}，跳过`);
      continue;
    }
    const src = join(root, 'drafts', slug, 'index.html');
    if (!existsSync(src)) throw new Error(`缺少落地页草稿：${src}`);
    if (readFileSync(src, 'utf8').includes('data-no-cta')) {
      throw new Error(`${slug} 的落地页是在未配置收集方式时生成的，请先运行 node radar.js rebuild`);
    }
    mkdirSync(join(root, 'site', slug), { recursive: true });
    cpSync(src, join(root, 'site', slug, 'index.html'));
    const t = now();
    e.status = 'live';
    e.approvedAt = t.toISOString();
    e.deadline = new Date(t.getTime() + config.validation.hours * HOUR).toISOString();
    done.push(slug);
  }
  rebuildSiteIndex(root, pipeline);
  savePipeline(root, pipeline);
  return done;
}

// ---------- 线索统计 ----------
// 线索来源是一份 CSV（表头 date,slug,type,note；type 为 lead 或 paid），
// 可以是本地文件，也可以是任何返回 CSV 的网址（表单后端导出、在线表格发布的 CSV 等）。
export async function readLeads(root, config) {
  const src = process.env.LEADS_SOURCE || config.landing.leadsSource;
  if (!src) return [];
  let text;
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`读取线索失败 ${res.status}`);
    text = await res.text();
  } else {
    const p = isAbsolute(src) ? src : join(root, src);
    if (!existsSync(p)) return [];
    text = readFileSync(p, 'utf8');
  }
  const [head, ...rows] = text.split(/\r?\n/).filter((l) => l.trim());
  if (!head) return [];
  const cols = head.split(',').map((c) => c.trim().toLowerCase());
  const si = cols.indexOf('slug');
  const ti = cols.indexOf('type');
  if (si < 0) throw new Error('线索 CSV 缺少 slug 列');
  return rows.map((r) => {
    const c = r.split(',');
    return { slug: (c[si] || '').trim(), type: ((ti >= 0 && c[ti]) || 'lead').trim().toLowerCase() };
  });
}

// ---------- 到期下结论 ----------
export async function track(root, config) {
  const pipeline = loadPipeline(root);
  const leads = await readLeads(root, config);
  const v = config.validation;
  const t = now();
  const events = [];

  for (const e of Object.values(pipeline)) {
    // 长期没人批准的草稿自动过期，避免越积越多
    if (e.status === 'draft' && t - new Date(e.createdAt) > v.draftExpireDays * 24 * HOUR) {
      e.status = 'expired';
      rmSync(join(root, 'drafts', e.slug), { recursive: true, force: true });
      events.push(`🗑 ${e.name}（${e.slug}）超过 ${v.draftExpireDays} 天未批准，草稿已清理`);
      continue;
    }
    if (e.status !== 'live' && e.status !== 'scale') continue;
    const mine = leads.filter((l) => l.slug === e.slug);
    const paid = mine.filter((l) => l.type === 'paid').length;
    const total = mine.length;
    if (total > (e.leads || 0)) events.push(`🔔 ${e.name}（${e.slug}）新增 ${total - (e.leads || 0)} 条线索，累计 ${total} 条，其中付款 ${paid}`);
    e.leads = total;
    e.paid = paid;
    if (e.status !== 'live') continue;

    const pass = paid >= v.minPaid || total >= v.minLeads;
    const due = t >= new Date(e.deadline);
    if (!pass && !due) continue;

    let verdict;
    if (pass) {
      verdict = '放大';
      e.status = 'scale';
    } else if (total >= 1 && !e.extended) {
      // 有人感兴趣但不够：只给一次延长，提醒换人群或换定价
      verdict = '调整';
      e.extended = true;
      e.deadline = new Date(t.getTime() + v.hours * HOUR).toISOString();
    } else {
      verdict = '停';
      e.status = 'stopped';
      rmSync(join(root, 'site', e.slug), { recursive: true, force: true });
    }
    e.verdict = verdict;
    e.verdictAt = t.toISOString();
    const why =
      verdict === '放大'
        ? `达标（线索 ${total}/${v.minLeads}，付款 ${paid}/${v.minPaid}）`
        : verdict === '调整'
          ? `有 ${total} 条线索但未达标，延长 ${v.hours} 小时，请换人群或定价再推一次`
          : `到期未达标（线索 ${total}，付款 ${paid}），落地页已下线`;
    events.push(`📌 ${e.name}（${e.slug}）结论：${verdict} —— ${why}`);
    const hours = Math.round((t - new Date(e.approvedAt)) / HOUR);
    appendFileSync(
      join(root, 'experiments.md'),
      `| ${dateCN(new Date(e.approvedAt))} | [${e.name}](${e.url}) | ${(e.hypothesis || '').replace(/\|/g, '/')} | 落地页 + 发帖草稿（自动生成） | 上线 ${hours} 小时 | 线索 ${total} / 付款 ${paid} | ${verdict} |\n`
    );
  }
  rebuildSiteIndex(root, pipeline);
  savePipeline(root, pipeline);
  return events;
}

// 日报里的"实验进展"一节
export function progressLines(pipeline) {
  const t = now();
  const lines = [];
  for (const e of Object.values(pipeline)) {
    if (e.status === 'draft') {
      lines.push(`- ⏳ 待批准 \`${e.slug}\` · ${e.name}（创建于 ${dateCN(new Date(e.createdAt))}）`);
    } else if (e.status === 'live') {
      const left = Math.max(0, Math.round((new Date(e.deadline) - t) / HOUR));
      lines.push(`- 🟢 验证中 \`${e.slug}\` · ${e.name} · 线索 ${e.leads || 0} / 付款 ${e.paid || 0} · 剩余 ${left} 小时${e.extended ? '（已延长一次）' : ''}`);
    } else if (e.status === 'scale') {
      lines.push(`- 🚀 放大 \`${e.slug}\` · ${e.name} · 线索 ${e.leads || 0} / 付款 ${e.paid || 0}`);
    }
  }
  return lines;
}
