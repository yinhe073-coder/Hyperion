// 落地页与发帖草稿的生成模板。
// 落地页是"预约/候补"页：明确写出产品尚在筹备、价格是计划价，不放任何虚构的数据或评价。

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
:root{--bg:#fbfaf7;--fg:#1c1b19;--muted:#6b675f;--line:#e4e0d6;--accent:#1f6f5c;--accent-fg:#fff;--card:#fff}
@media(prefers-color-scheme:dark){:root{--bg:#161614;--fg:#eceae4;--muted:#a09c92;--line:#33312c;--accent:#5fc9ad;--accent-fg:#10231e;--card:#1e1e1b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif}
main{max-width:680px;margin:0 auto;padding:56px 20px 72px}
.tag{display:inline-block;font-size:13px;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:2px 12px;margin-bottom:20px}
h1{font-size:clamp(28px,6vw,40px);line-height:1.25;margin:0 0 16px;letter-spacing:-.01em}
.sub{font-size:19px;color:var(--muted);margin:0 0 32px}
ul{list-style:none;padding:0;margin:0 0 32px}
li{padding:14px 0 14px 30px;border-top:1px solid var(--line);position:relative}
li:last-child{border-bottom:1px solid var(--line)}
li::before{content:"";position:absolute;left:4px;top:26px;width:10px;height:10px;border-radius:50%;background:var(--accent)}
.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px}
.price{font-size:22px;font-weight:600;margin:0 0 4px}
.note{font-size:14px;color:var(--muted);margin:0 0 18px}
form{display:flex;gap:10px;flex-wrap:wrap}
input[type=email]{flex:1 1 220px;min-width:0;padding:12px 14px;font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:10px}
button,.btn{display:inline-block;padding:12px 22px;font:inherit;font-weight:600;color:var(--accent-fg);background:var(--accent);border:0;border-radius:10px;cursor:pointer;text-decoration:none}
footer{margin-top:40px;font-size:13px;color:var(--muted)}
a{color:var(--accent)}
`;

function cta(kit, slug, landing) {
  const label = esc(kit.cta || '加入候补名单');
  if (landing.formAction) {
    return `<form method="POST" action="${esc(landing.formAction)}">
        <input type="hidden" name="slug" value="${esc(slug)}">
        <input type="email" name="email" required placeholder="你的邮箱" aria-label="邮箱">
        <button type="submit">${label}</button>
      </form>`;
  }
  if (landing.contactEmail) {
    const subject = encodeURIComponent(`预约 ${kit.name} [${slug}]`);
    return `<a class="btn" href="mailto:${esc(landing.contactEmail)}?subject=${subject}">${label}（发邮件预约）</a>`;
  }
  return `<p class="note" data-no-cta>预约通道准备中。</p>`;
}

export function landingPage(kit, slug, landing) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(kit.name)} — ${esc(kit.headline)}</title>
<meta name="description" content="${esc(kit.subhead)}">
<style>${CSS}</style>
</head>
<body>
<main>
  <span class="tag">筹备中 · 开放预约</span>
  <h1>${esc(kit.headline)}</h1>
  <p class="sub">${esc(kit.subhead)}</p>
  <ul>
${kit.bullets.map((b) => `    <li>${esc(b)}</li>`).join('\n')}
  </ul>
  <div class="box">
    <p class="price">${esc(kit.price)}</p>
    <p class="note">这是计划定价。「${esc(kit.name)}」还在筹备，预约不收费；人数够了就开工，并优先通知预约的人。</p>
    ${cta(kit, slug, landing)}
  </div>
  <footer>适合：${esc(kit.audience)}</footer>
</main>
</body>
</html>
`;
}

export function siteIndex(entries) {
  const items = entries.length
    ? entries.map((e) => `    <li><a href="./${esc(e.slug)}/">${esc(e.name)}</a></li>`).join('\n')
    : '    <li>暂无进行中的项目</li>';
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>正在筹备的项目</title>
<style>${CSS}</style>
</head>
<body>
<main>
  <h1>正在筹备的项目</h1>
  <ul>
${items}
  </ul>
</main>
</body>
</html>
`;
}

export function postsMarkdown(kit, signal, slug) {
  return `# 发帖草稿：${kit.name}

> 这些是草稿，需要你本人审阅后手动发布。不要用脚本群发，也不要在不相关的地方贴广告。
> 落地页批准后的地址：\`<你的 Pages 地址>/${slug}/\`（把草稿里的 {{LINK}} 换成它）

来源信号：[${signal.title.replace(/\n/g, ' ')}](${signal.url})

## 1. 回复原帖（转化最高）

${kit.reply_draft}

## 2. 社群发帖

建议渠道：${kit.channels.join('、')}

**标题**：${kit.post_title}

${kit.post_body}

## 3. 私信模板（只发给公开表达过同样需求的人，逐个发，逐个改）

${kit.dm_draft}
`;
}
