#!/usr/bin/env node
// 机会雷达：采集 → 去重 → 规则打分 → (可选) AI 评估 → 生成日报
//   node radar.js          正常运行，写入 reports/ 并更新 data/seen.json
//   node radar.js --dry    只打印，不写任何文件

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './sources.js';
import { scoreSignal } from './score.js';
import { llmEvaluate } from './llm.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry');
const config = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
const seenPath = join(ROOT, 'data', 'seen.json');
const seen = JSON.parse(readFileSync(seenPath, 'utf8'));
// 按北京时间取日期，和推送时间保持一致
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

const { signals, status } = await collect(config);
console.log('采集结果:', status);

// 去重：本次内按 id 去重，并排除以前日报里出现过的
const uniq = [...new Map(signals.map((s) => [s.id, s])).values()].filter((s) => !seen[s.id]);
const ranked = uniq.map((s) => scoreSignal(s, config)).sort((a, b) => b.score - a.score);

const candidates = ranked.slice(0, config.llmTopN);
const ai = await llmEvaluate(candidates, config);

let final;
if (ai) {
  const order = { 做: 0, 观察: 1, 放弃: 2 };
  final = candidates
    .map((s) => ({ ...s, ai: ai.get(s.id) }))
    .filter((s) => s.ai && s.ai.verdict !== '放弃')
    .sort((a, b) => order[a.ai.verdict] - order[b.ai.verdict] || b.ai.score - a.ai.score)
    .slice(0, config.topN);
} else {
  final = ranked.slice(0, config.topN);
}

const md = [];
md.push(`# 机会日报 ${today}`);
md.push('');
md.push(
  `本期新信号 ${uniq.length} 条，入选 ${final.length} 条；评估方式：${ai ? 'AI 评估 + 规则初筛' : '规则打分（未配置 ANTHROPIC_API_KEY）'}。`
);
md.push('');
md.push(
  `来源状态：${Object.entries(status).map(([k, v]) => `${k} ${v}`).join(' · ')}`
);
md.push('');
final.forEach((s, i) => {
  const head = s.ai ? `【${s.ai.verdict}】${s.ai.score} 分` : `${s.score} 分`;
  md.push(`## ${i + 1}. ${head} · ${s.title}`);
  md.push('');
  md.push(`来源：${s.source}（${s.kind === 'pain' ? '需求信号' : '走红信号'}） · [原文](${s.url})`);
  md.push('');
  if (s.text) md.push(`> ${s.text.replace(/\n/g, ' ')}`, '');
  if (s.ai) {
    md.push(`- **机会**：${s.ai.opportunity}`);
    md.push(`- **谁付钱**：${s.ai.who_pays}`);
    md.push(`- **48 小时 MVP**：${s.ai.mvp_48h}`);
    md.push(`- **今天的第一步**：${s.ai.first_step}`);
    md.push(`- **最大风险**：${s.ai.risk}`);
  } else {
    md.push(`规则分项：${Object.entries(s.parts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  }
  md.push('');
});
md.push('---');
md.push('下一步：从上面最多挑 1 条，按 README「第 3 步：48 小时验证」执行，并在 `experiments.md` 记一行。');
const report = md.join('\n') + '\n';

if (DRY) {
  console.log(report);
} else {
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  const file = join(ROOT, 'reports', `${today}.md`);
  writeFileSync(file, report);
  // 记住所有进入过候选的信号，避免重复推荐；只保留 60 天
  const now = Math.floor(Date.now() / 1000);
  for (const s of candidates) seen[s.id] = now;
  for (const [id, t] of Object.entries(seen)) if (now - t > 60 * 86400) delete seen[id];
  writeFileSync(seenPath, JSON.stringify(seen, null, 0) + '\n');
  console.log(`已生成 ${file}`);
}

// 所有来源都挂了才算失败（让定时任务变红提醒你）
if (Object.values(status).every((v) => typeof v === 'string')) process.exit(1);
