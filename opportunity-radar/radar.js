#!/usr/bin/env node
// 机会雷达。分阶段运行，阶段之间用文件交接：
//
//   node radar.js collect            采集+去重+规则打分 → data/candidates.json
//   node radar.js evaluate           AI 评估 → data/evaluation.json（需要 ANTHROPIC_API_KEY；
//                                    若该文件的 runId 已与候选一致则跳过，所以也可以由 Claude Code 按 skill 说明手写）
//   node radar.js build              生成日报、落地页草稿、发帖草稿，登记待批准的实验
//   node radar.js rebuild            改了 landing 配置后，重新生成待批准实验的落地页和草稿
//   node radar.js approve <slug...>  批准实验：落地页进入 site/，开始 48 小时计时
//   node radar.js track              统计线索，到期自动下结论并记入 experiments.md
//   node radar.js status             查看所有实验的当前状态
//   node radar.js run                track → collect → evaluate → build（定时任务用这个）

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './sources.js';
import { scoreSignal } from './score.js';
import { llmEvaluate, validateEvaluations } from './llm.js';
import { landingPage, postsMarkdown } from './landing.js';
import { approve, track, loadPipeline, savePipeline, progressLines, now, dateCN } from './pipeline.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
const P = (...a) => join(ROOT, ...a);
const readJSON = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const writeJSON = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

async function cmdCollect() {
  const seen = readJSON(P('data', 'seen.json'), {});
  const { signals, status } = await collect(config);
  console.log('采集结果:', status);
  // 按 id 去重，再按标题去重（同一个帖子常被重复发到不同版块）
  const byId = [...new Map(signals.map((s) => [s.id, s])).values()].filter((s) => !seen[s.id]);
  const titles = new Set();
  const uniq = byId.filter((s) => {
    const key = s.title.replace(/[\s?？!！。.,，]/g, '').toLowerCase().slice(0, 12);
    if (titles.has(key)) return false;
    titles.add(key);
    return true;
  });
  const ranked = uniq.map((s) => scoreSignal(s, config)).sort((a, b) => b.score - a.score);
  // 每个来源最多占 perSourceCap 条，避免某一个来源刷屏
  const used = {};
  const picked = ranked.filter((s) => {
    const key = s.source.split('/')[0];
    used[key] = (used[key] || 0) + 1;
    return used[key] <= config.perSourceCap;
  });
  // runId 把评估文件和这一批候选绑定，防止同一天重跑后张冠李戴
  const out = { runId: now().toISOString(), date: dateCN(), status, total: uniq.length, candidates: picked.slice(0, config.llmTopN) };
  writeJSON(P('data', 'candidates.json'), out);
  console.log(`新信号 ${uniq.length} 条，前 ${out.candidates.length} 条写入 data/candidates.json`);
  // 所有来源都失败才算失败（让定时任务变红提醒你）
  if (Object.values(status).every((v) => typeof v === 'string')) throw new Error('所有数据源都失败了');
}

function loadCandidates() {
  const c = readJSON(P('data', 'candidates.json'));
  if (!c) throw new Error('没有 data/candidates.json，请先运行 node radar.js collect');
  return c;
}

async function cmdEvaluate() {
  const c = loadCandidates();
  const file = P('data', 'evaluation.json');
  if (readJSON(file)?.runId === c.runId) return console.log('这一批候选已有评估文件，跳过 AI 调用');
  const res = await llmEvaluate(c.candidates, config);
  if (!res) return console.log('未进行 AI 评估（没有 ANTHROPIC_API_KEY 或调用失败），日报将使用规则打分');
  validateEvaluations(res, c.candidates.map((s) => s.id));
  writeJSON(file, { runId: c.runId, ...res });
  console.log(`AI 评估完成 → ${file}`);
}

// 落地页和发帖草稿由实验记录里保存的 kit 生成，随时可以重做
function writeDrafts(e) {
  mkdirSync(P('drafts', e.slug), { recursive: true });
  writeFileSync(P('drafts', e.slug, 'index.html'), landingPage(e.kit, e.slug, config.landing));
  writeFileSync(P('drafts', e.slug, 'posts.md'), postsMarkdown(e.kit, e, e.slug));
}

// 改了 config.json 的 landing 配置后，重新生成所有待批准实验的草稿
function cmdRebuild() {
  const drafts = Object.values(loadPipeline(ROOT)).filter((e) => e.status === 'draft' && e.kit);
  drafts.forEach(writeDrafts);
  console.log(drafts.length ? `已重新生成：${drafts.map((e) => e.slug).join(', ')}` : '没有待批准的实验');
}

function cmdBuild() {
  const c = loadCandidates();
  let ev = readJSON(P('data', 'evaluation.json'));
  if (ev && ev.runId !== c.runId) {
    console.warn('data/evaluation.json 的 runId 与当前候选不一致（候选已重新采集），本次按规则打分出日报');
    ev = null;
  }
  if (ev) validateEvaluations(ev, c.candidates.map((s) => s.id));
  const ai = ev && new Map(ev.items.map((it) => [it.id, it]));
  const pipeline = loadPipeline(ROOT);

  let final;
  if (ai) {
    const order = { 做: 0, 观察: 1 };
    final = c.candidates
      .map((s) => ({ ...s, ai: ai.get(s.id) }))
      .filter((s) => s.ai && s.ai.verdict !== '放弃')
      .sort((a, b) => order[a.ai.verdict] - order[b.ai.verdict] || b.ai.score - a.ai.score)
      .slice(0, config.topN);
  } else {
    final = c.candidates.slice(0, config.topN);
  }

  // 为"做"的机会生成落地页草稿和发帖草稿，登记为待批准实验
  let made = 0;
  const noCta = !config.landing.formAction && !config.landing.contactEmail;
  for (const s of final) {
    const kit = s.ai?.kit;
    if (!kit) continue;
    const existing = pipeline[kit.slug];
    if (existing && existing.id !== s.id) {
      console.warn(`slug ${kit.slug} 已被另一个实验占用，跳过`);
      continue;
    }
    if (!existing && made >= config.maxKitsPerDay) continue;
    if (!existing) {
      pipeline[kit.slug] = {
        slug: kit.slug,
        id: s.id,
        name: kit.name,
        title: s.title,
        url: s.url,
        hypothesis: s.ai.who_pays,
        status: 'draft',
        createdAt: now().toISOString(),
        leads: 0,
        paid: 0,
        kit,
      };
      writeDrafts(pipeline[kit.slug]);
      made++;
    }
    s.slug = kit.slug;
  }
  savePipeline(ROOT, pipeline);
  if (made && noCta) console.warn('提示：尚未配置 landing.formAction / landing.contactEmail，落地页没有预约入口，批准前需要先配置并运行 node radar.js rebuild');

  // ---- 日报 ----
  const md = [`# 机会日报 ${c.date}`, ''];
  const how = ai ? `AI 评估（${ev.evaluator || 'claude'}）+ 规则初筛` : '规则打分（未进行 AI 评估）';
  md.push(`本期新信号 ${c.total} 条，入选 ${final.length} 条；评估方式：${how}。`, '');
  md.push(`来源状态：${Object.entries(c.status).map(([k, v]) => `${k} ${v}`).join(' · ')}`, '');

  const events = readJSON(P('data', 'events.json'), []);
  const prog = progressLines(pipeline);
  if (events.length || prog.length) {
    md.push('## 实验进展', '', ...events.map((e) => `- ${e}`), ...prog, '');
    if (prog.some((l) => l.includes('待批准'))) {
      md.push('批准方式：在本 Issue 下回复 `/approve <slug>`（可一次写多个），或本地运行 `node radar.js approve <slug>`。批准后落地页自动上线并开始 48 小时计时；发帖草稿在 `drafts/<slug>/posts.md`，需要你本人发出去。', '');
    }
  }

  md.push('## 今日机会', '');
  final.forEach((s, i) => {
    const head = s.ai ? `【${s.ai.verdict}】${s.ai.score} 分` : `${s.score} 分`;
    md.push(`### ${i + 1}. ${head} · ${s.title.replace(/\s+/g, ' ')}`, '');
    md.push(`来源：${s.source}（${s.kind === 'pain' ? '需求信号' : '走红信号'}） · [原文](${s.url})`, '');
    if (s.text) md.push(`> ${s.text.replace(/\s+/g, ' ')}`, '');
    if (s.ai) {
      md.push(`- **机会**：${s.ai.opportunity}`);
      md.push(`- **谁付钱**：${s.ai.who_pays}`);
      md.push(`- **48 小时 MVP**：${s.ai.mvp_48h}`);
      md.push(`- **今天的第一步**：${s.ai.first_step}`);
      md.push(`- **最大风险**：${s.ai.risk}`);
      if (s.slug) md.push(`- **已备好素材**：落地页 \`drafts/${s.slug}/index.html\`、发帖草稿 \`drafts/${s.slug}/posts.md\` → 回复 \`/approve ${s.slug}\` 上线`);
    } else {
      md.push(`规则分项：${Object.entries(s.parts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    }
    md.push('');
  });
  mkdirSync(P('reports'), { recursive: true });
  // 同一天多次运行时追加序号，不覆盖之前的日报
  const marker = `<!-- run ${c.runId} -->`;
  let file = P('reports', `${c.date}.md`);
  for (let n = 2; existsSync(file) && !readFileSync(file, 'utf8').includes(marker); n++) file = P('reports', `${c.date}-${n}.md`);
  writeFileSync(file, md.join('\n') + `\n${marker}\n`);
  writeFileSync(P('data', 'last-report.txt'), file.slice(ROOT.length + 1) + '\n');
  if (ev) writeJSON(P('data', 'evaluations', file.slice(P('reports').length + 1).replace(/\.md$/, '.json')), ev);

  // 记住进入过候选的信号，60 天内不重复推荐
  const seen = readJSON(P('data', 'seen.json'), {});
  const ts = Math.floor(now() / 1000);
  for (const s of c.candidates) seen[s.id] = ts;
  for (const [id, t] of Object.entries(seen)) if (ts - t > 60 * 86400) delete seen[id];
  writeFileSync(P('data', 'seen.json'), JSON.stringify(seen) + '\n');
  writeJSON(P('data', 'events.json'), []);
  console.log(`已生成 ${file}${made ? `，新增 ${made} 个待批准实验` : ''}`);
}

async function cmdTrack() {
  const events = await track(ROOT, config);
  // 留给下一次 build 写进日报
  const prev = readJSON(P('data', 'events.json'), []);
  writeJSON(P('data', 'events.json'), [...prev, ...events]);
  console.log(events.length ? events.join('\n') : '实验没有新变化');
}

function cmdStatus() {
  const lines = progressLines(loadPipeline(ROOT));
  const stopped = Object.values(loadPipeline(ROOT)).filter((e) => e.status === 'stopped');
  console.log(lines.length ? lines.join('\n') : '没有进行中的实验');
  if (stopped.length) console.log(`已停止：${stopped.map((e) => e.slug).join(', ')}`);
}

const [cmd = 'run', ...args] = process.argv.slice(2);
try {
  if (cmd === 'collect') await cmdCollect();
  else if (cmd === 'evaluate') await cmdEvaluate();
  else if (cmd === 'build') cmdBuild();
  else if (cmd === 'track') await cmdTrack();
  else if (cmd === 'status') cmdStatus();
  else if (cmd === 'rebuild') cmdRebuild();
  else if (cmd === 'approve') {
    const slugs = args.filter((a) => !a.startsWith('--'));
    if (!slugs.length) throw new Error('用法：node radar.js approve <slug...>');
    const done = approve(ROOT, config, slugs);
    console.log(done.length ? `已上线：${done.join(', ')}（48 小时后自动下结论）` : '没有需要上线的实验');
  } else if (cmd === 'run') {
    await cmdTrack();
    await cmdCollect();
    await cmdEvaluate();
    cmdBuild();
  } else throw new Error(`未知命令：${cmd}`);
} catch (e) {
  console.error(`错误：${e.message}`);
  process.exit(1);
}
