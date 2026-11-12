# 机会雷达：自动找机会 → 自动备好验证素材 → 你点一下批准 → 自动统计下结论

机器每天做完下面这些事，你只需要做两件：**批准**和**把草稿发出去**。

```
每天自动：  统计在跑的实验 → 抓信号 → 去重打分 → AI 评估 → 出日报
            └ 对评为「做」的机会：自动生成落地页 + 发帖草稿，登记为待批准实验
你：        回复 /approve <slug>            （一次点击）
自动：      落地页上线到 GitHub Pages，开始 48 小时计时
你：        把 drafts/<slug>/posts.md 里的草稿发到对应社群   （几分钟）
每天自动：  统计线索 → 到期按规则下结论（放大 / 调整 / 停）→ 记入台账 → 停掉的自动下线
```

边界说在前面：它自动化的是找线索、初筛、备素材、记账和下结论。对外发帖、收款、交付需要你本人，
脚本自动发帖和群发私信违反各平台规则，这里刻意不做。它也不保证赚钱。

## 两种运行方式

| | 定时工作流（GitHub Actions） | Claude Code skill |
|---|---|---|
| 怎么触发 | 每天 08:17 自动跑，或在 Actions 页手动运行 | 在本仓库的 Claude Code 里说「跑一下机会雷达」 |
| 谁做 AI 评估 | Claude API（需要 `ANTHROPIC_API_KEY`） | Claude Code 自己（不需要 API 密钥） |
| 结果去哪 | 提交到仓库 + 开 Issue（邮件通知） | 写入本地文件并当面汇报 |

两种方式产出同样的文件，可以混用。skill 的说明在 `.claude/skills/opportunity-radar/SKILL.md`。

## 一次性设置

1. **改画像**：`config.json` 的 `profile.about` 和 `fitKeywords` 改成你的真实情况。这是筛选质量的最大杠杆。
2. **配置收集线索的方式**（二选一，不配置就无法批准上线）：
   - `landing.formAction`：任意表单后端的提交地址，落地页会用它收集邮箱（表单带隐藏字段 `slug`）。
   - `landing.contactEmail`：没有表单后端时，按钮变成「发邮件预约」。注意这个邮箱会公开显示在落地页上。
3. **线索从哪读**：`landing.leadsSource` 是一份 CSV（表头 `date,slug,type,note`，`type` 为 `lead` 或 `paid`）。
   默认是本地的 `data/leads.csv`，有人预约或付款时加一行即可；
   如果你的表单后端或在线表格能导出 CSV 网址，把网址填进去（或设为仓库 Secret `LEADS_SOURCE`），统计就完全自动。
4. **启用定时工作流**：
   - 把本目录、`.github/workflows/opportunity-radar.yml` 和 `.claude/skills/` 合并到仓库的**默认分支**（定时任务和 Issue 评论触发都只认默认分支）。
   - Settings → Secrets and variables → Actions：添加 `ANTHROPIC_API_KEY`。不加也能跑，但只有规则打分，不会生成落地页和草稿。
   - Settings → Actions → General → Workflow permissions：选 Read and write。
   - Settings → Pages → Source：选 GitHub Actions（落地页发布用）。

## 命令

都在 `opportunity-radar/` 目录下运行，Node 20+。只有走 API 评估时才需要 `npm install`。

| 命令 | 作用 |
|---|---|
| `node radar.js run` | 一次跑完：track → collect → evaluate → build |
| `node radar.js collect` | 采集、去重、规则打分 → `data/candidates.json` |
| `node radar.js evaluate` | 调用 Claude API 评估 → `data/evaluation.json` |
| `node radar.js build` | 生成日报、落地页草稿、发帖草稿，登记待批准实验 |
| `node radar.js rebuild` | 改了 `landing` 配置后，重新生成待批准实验的落地页和草稿 |
| `node radar.js approve <slug>` | 批准：落地页进入 `site/`，开始计时 |
| `node radar.js track` | 统计线索，到期下结论，写入 `experiments.md` |
| `node radar.js status` | 查看所有实验状态 |

## 各环节说明

**信号来源**（`sources.js`，全部是无需登录的公开接口）

| 来源 | 类型 | 为什么抓 |
|---|---|---|
| HN 评论里的 "I wish there was / I'd pay for…" | 需求 | 有人明说想要、甚至明说愿意付钱 |
| Ask HN 热帖 | 需求 | 一群人在讨论同一个没解决好的问题 |
| V2EX 热门/最新（关键词过滤，跳过招聘和闲聊节点） | 需求 | 中文用户的求推荐、吐槽、求替代 |
| Show HN 高票、V2EX 分享创造 | 走红 | 已被市场投票验证的新产品 |
| GitHub 两周内 star 飙升的新仓库 | 走红 | 开发者正在追的方向，可做周边、代跑、教程 |
| Product Hunt 新品 | 走红 | 海外新品，可做中文版或更细分的版本 |

每个来源最多占 `perSourceCap` 条候选，推荐过的信号 60 天内不重复出现。

**评估**：规则打分（`score.js`）只做粗筛，会混进无关帖子。真正的判断来自 AI 评估：结合你的画像逐条给出
做 / 观察 / 放弃，以及机会是什么、谁付钱、48 小时能做出的最小版本、今天的第一步、最大风险。
标准从严，「做」每天最多 `maxKitsPerDay` 条，没有合适的就不给。

**落地页**（`landing.js`）：一页式预约页，明确标注「筹备中」和「计划定价」，不含任何虚构的数据或评价。
批准前在 `drafts/<slug>/index.html` 可以直接用浏览器打开预览。

**发帖草稿**（`drafts/<slug>/posts.md`）：回复原帖、社群发帖、私信模板各一份。需要你本人审阅后手动发。

**下结论的规则**（`config.json` 的 `validation`，都是经验值，可调）：

- **放大**：`hours`（48）小时内付款 ≥ `minPaid`（1）或线索 ≥ `minLeads`（5）。达标即刻生效，不用等到期。
- **调整**：到期时有线索但不够 → 延长一次 48 小时，换人群或换定价再推。只延长一次。
- **停**：到期没有线索，或延长后仍不达标 → 落地页自动下线。
- 草稿超过 `draftExpireDays`（7）天没批准会自动清理。

统计只看线索和付款，不统计访问量（静态页面没有后端）。

## 每周复盘（30 分钟）

只看 `experiments.md` 和本周日报：

1. 有价值的条目来自哪些来源和关键词？→ 加强（`painPhrases`、`v2exKeywords`、`weights`）。
2. 哪些来源全是噪音？→ 删掉或收紧。
3. 实验失败的共同原因是什么？→ 写进 `profile.about`，让评估以后避开。
4. 「放大」的实验按这个顺序推进：手工交付 3–5 单 → 把重复劳动写成脚本 → 第 5 单以后再产品化。

## 文件

| 路径 | 作用 |
|---|---|
| `radar.js` | 命令入口 |
| `sources.js` / `score.js` | 采集与规则打分 |
| `llm.js` | Claude API 评估，以及评估文件的格式校验 |
| `landing.js` | 落地页与发帖草稿模板 |
| `pipeline.js` | 实验状态、批准、线索统计、下结论 |
| `config.json` | 画像、关键词、权重、落地页与验证规则 |
| `data/pipeline.json` | 所有实验的状态 |
| `data/leads.csv` | 线索记录 |
| `data/evaluation.json`、`data/evaluations/` | 最近一次评估及历史存档 |
| `reports/` | 日报 |
| `drafts/<slug>/` | 待批准实验的落地页和发帖草稿 |
| `site/` | 已上线的落地页（发布到 GitHub Pages） |
| `experiments.md` | 实验台账（自动追加） |

## 已知局限

- Claude API 评估这条路径没有在真实密钥下跑过，只验证了请求能到达接口、失败时会退回规则打分。
- 定时工作流、Issue 评论批准、Pages 发布需要合并到默认分支后才会运行，尚未在 GitHub 上实际执行过。
- Reddit、小红书、知乎、即刻等需要登录或会拦截云端 IP，没有接入。
- 只抓公开接口、每天一次，属于正常访问频率；请遵守各站点的使用条款，不要调高频率。
