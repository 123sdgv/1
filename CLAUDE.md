# 小手机 开发手册

写给接手开发的 Claude。每个新对话开工前先读一遍；做完一块、或者 gray 提了新的长期要求，就顺手更新这份文件（尤其是「现状」和「待办」）。

## 概况

- 一台网页「小手机」：锁屏 → 主屏幕 → 各个 App。在社交 App 里跟自己设定的角色聊天、发动态，在线下 App 里写面对面的长文。角色会写日记、记住关于你的事、很久没聊会来找你、自己发动态。
- **只做壳子**：角色、人设、世界观、提示词以外的内容全是 gray 在 App 里自己填，代码里不放任何预设角色或设定。
- 纯前端、纯静态：没有后端、没有构建步骤、没有 npm 依赖，ES module 直接跑。GitHub Pages：https://123sdgv.github.io/1/
- **`.nojekyll` 必须保留。**
- gray 用的是**有 Home 键的 iPhone**（375×667），会「添加到主屏幕」全屏用。测试两种尺寸：390×844、375×667。电脑上会显示成一台居中的手机。
- 参考过的资料（只学思路，代码不照搬）：Game Over 仓库的 `games/lost/`（失物，页面栈、手机界面）、`games/chat/`（气泡偏好）；Notion「用于记录K / 资料库」里的朋友圈教程第六篇、Cakumi 长期记忆、AI主动发消息iOS、惦记系统、叙事诗小手机、玄鲸小手机。完整的规划在 Claude Doc「小手机 · 开工清单」（https://claude.ai/artifact/EukkfBu9ns5nj6XsGk3VuF）。

## 目录

```
index.html  manifest.webmanifest  .nojekyll  assets/（网站图标：黑底白色心电图，icon.svg 是源，PNG 用 Playwright 渲染）
css/  base.css（颜色变量、通用部件）  phone.css（锁屏、主屏、小组件、窗口）  social.css  apps.css
js/main.js                入口：读存档 → 壁纸 → 主屏 → 锁屏 → 横幅通知 → 后台补算；键盘弹出时缩手机
js/core/
  store.js     存档：IndexedDB 一张键值表，启动时全读进内存，改了延迟写回；导出导入就是整表倒出/倒入；事件总线 on/emit
  data.js      数据模型（下面有表），界面只通过这里读写，改了就 emit
  api.js       OpenAI 兼容接口（地址自动补 /v1/chat/completions），流式；后台任务排队 queue()
  prompt.js    ★所有提示词都在这里★（调说话方式、日记写法改这个文件）
  context.js   决定给模型看哪些数据、看多少，拼成 messages
  parse.js     模型回复 → 气泡部件（聊天格式见文件头），反过来写回；JSON 容错解析
  chat.js      角色回复（聊天、线下）：流式、重新生成成新版本、转账动作、日程进日历、未读、通知；
               你发完消息自动回（autoReply：停 1.8 秒、还在打字就再等；他回的时候你又发了，回完接着回）
  life.js      角色不在眼前时的生活：动态点赞评论回复、写日记+更新备忘录、起网名签名、自己发动态、很久没聊来找你
  weather.js   Open-Meteo（不要 Key、支持跨域）
  crop.js      选图 + 裁剪（拖动、双指/滚轮/滑条缩放），壁纸还带模糊滑条
  ui.js  time.js   （ui.js 开头把 append(null) 改成跳过，不会再冒出 "null" 字）
js/phone/
  apps.js      App 清单（加 App 在这加一行）
  icons.js     App 图标（120×120 原创 SVG，白底黑画；日历图标显示当天日期）
  home.js      主屏幕：4 列格子 + Dock，长按整理（拖动、小组件大中小、删、加）
  widgets.js   小组件（加一种在 WIDGETS 里加一项）
  lock.js      锁屏、未读通知、上滑、密码键盘
  window.js    打开/关闭 App 的放大缩小动画、底部横条
js/apps/<id>/index.js   每个 App 导出 mount(body, { close, arg }) → { go(arg), destroy() }
js/apps/shared.js       文字照片、看照片、选角色
js/apps/social/         index（三个标签页）list（消息）chat（聊天页）char（角色资料 + 他的生活）moments（动态）me（我的、切换身份）stickers（表情包面板）
```

## 数据（都在 data.js，键名就是存档里的键）

| 键 | 内容 |
|---|---|
| `accounts` / `curAcc` | 身份（像 QQ 的多个号）：名字、头像、签名、人设、世界观、动态封面、气泡样式。角色、聊天、动态、日记、相册、线下都按身份分开 |
| `chars` | 角色：`acc` 属于哪个身份、名字、昵称（备注）、头像、人设、网名 `net` 和签名 `sign`（他自己起）、`knows` 认识谁（每个角色单独勾，gray 定的）、`life` 他的生活（来找你/多久算久、发动态/多久一条、写日记/至少隔多久、别打扰的时间段；`D.lifeOf(c)` 取，缺的用老的全局设置补） |
| `msgs.<角色id>` | 聊天记录：`{ role: me/them/note, ts, alts: [[部件…]…], cur }`。一条角色回复是一组气泡；重新生成就在 `alts` 里多一个版本，左右翻。部件：text、voice（text/tone/sec）、sticker（name）、photo、pay、event、note，text 和 voice 可以带 `quote: {who, text}`；老存档的 red 按转账显示 |
| `chatmeta` | 每个对话：未读、置顶、最后时间、`lastAway`、`nextPost` |
| `moments` | 动态：正文、配图描述、点赞、评论（`to` = 回复谁）、`jobs`（还没到时间的角色反应） |
| `diary.<角色id>` | 日记：`date`、`text`、`inner`（心里话）、`keys`（关键词，用来以后想起来）、`upto`（写到哪条消息为止） |
| `memo.<角色id>` | 备忘录 = 他记得的关于你的事，每次聊天都带上；写日记时模型按编号增删 |
| `events` | 日历（整台手机共用，`yearly` 每年重复，`done` 打过勾的日期，`by` 哪个角色记的）。`D.upcoming(天数)` 拿接下来的 |
| `stickers` | 表情包（所有身份、所有角色共用）：`{ id, name（这张什么意思）, src }`。角色按名字发，`D.stickerByName` 找图 |
| `photos` | 相册：照片只有文字描述 |
| `stories` / `story.<id>` | 线下剧情（一个角色、一个场景），记录结构和聊天一样，部件只有 text |
| `layout` | 主屏幕布局 |
| `settings` `api` `lock` `weather` `file.wallLock` `file.wallHome` `wallBlur` | 设置、接口、锁屏密码、天气城市和缓存、壁纸（裁好的图）和壁纸模糊度。壁纸用 CSS 变量 `--wall` `--wb`，锁屏的图在 `#lock::before` 上 |
| `secret.apiKey` | API Key：**不跟着导出**，导入时保留本机的（`store.js` 的 `SECRET`） |

## 记忆（不用向量，gray 定的）

每次聊天给模型：人设 + 世界观 + 你的人设 + 认识的人 → 备忘录全部 → 最近 3 篇日记 → 关键词命中的旧日记（最多 2 篇）→ 现在的时间、离上次多久、天气（现在、今天、明天）、接下来 30 天日历（今天的带完成没）→ 表情包名字清单 → 最近 N 条聊天记录（设置里调，默认 40）。

日记触发（`life.js` 的 `diaryDue`）：上一篇以后至少 10 条记录、最后一条已经过了 30 分钟（没在聊）、并且离上一篇超过「至少隔多久」（每个角色自己设，默认 20 小时）或者攒了 150 条。网页关着什么都不跑，**都是打开时补算**，开着的时候每 45 秒查一次。

## 聊天格式（模型每行一条消息）

`[图片] 描述`、`[语音] 话` / `[语音 语气] 话`、`[引用 原话几个字] 回复`、`[表情包 名字]`、`[转账 金额] 备注`、`[收下转账]`、`[退还转账]`、`[日程 YYYY-MM-DD] 事情` / `[日程 每年 MM-DD] 事情`、`[动态] 内容`。只把写完的整行变成气泡，所以是一条一条冒出来的。没有红包了（gray 定的，只留转账）；模型要是还写 `[红包]` 也按转账处理。你发的消息写给模型时用同样的格式。

## 测试（推之前必须做）

```bash
cd /home/claude/1 && python3 -m http.server 8765    # 后台跑
```
Python Playwright，`ctx.route('https://fake.api/**', …)` 做假接口（scratchpad 里有 fake.py / t6.py 可以参考，不一定还在）（按提示词里的关键字回聊天文字 / 日记 JSON / 动态 JSON），`ctx.route('https://api.open-meteo.com/**', …)` 做假天气。`window.__xsj = { S, D, openApp, currentApp }` 可以直接摆数据、开 App；`import('./js/core/life.js').then(m => m.tick())` 手动跑一次补算。锁屏上滑要从手机最底下往上拖（从通知卡片上开始拖不算；电脑尺寸下手机是居中的，按 `#lock` 的位置算）。存档写盘有 300ms 延迟，测试里要 reload 前先 `await __xsj.S.flush()`。选图用 `page.expect_file_chooser()`。截图放 scratchpad，自己打开看，控制台不能有报错。

## 提交

- 直接推 `main`。commit 作者 `Claude <noreply@anthropic.com>`，信息结尾加会话给的署名行。

```bash
git add -A && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "..." && git push origin HEAD:main
```

## gray 的偏好（长期有效）

- 叫他 **gray**，中文，轻松一点。拿不准的用提问工具问（推荐的放第一个）；小事自己定。**他没要的新玩法别自己加**，要加先问。
- 要**简单好用**，不要堆功能（不要语音电话视频、群聊、购物、查手机、红包）。聊天气泡只要一种样式，不做选择。改起来要方便：一个 App 一个文件夹，提示词集中在 `prompt.js`，颜色在 `base.css` 的变量。
- 整体**黑白**；网站图标是黑底白色心电图；App 图标白底、认真画；社交 App 结构参照 QQ（消息 / 动态 / 我的、点头像切身份），但**外观原创，不用 QQ 的名字、企鹅、配色**，也别做成像任何真实 App。
- 字体只用系统自带的。美术全部原创。
- 做完简短说：做了什么、怎么用、该重点试什么。

## 现状

- 2026-11-07 第一版：锁屏（密码、通知、上滑）、主屏（拖动、小组件大中小、加删）、社交（消息、聊天、转账文字照片、重新生成翻页、动态评论楼中楼、我的、多身份、角色资料）、线下、日记、备忘录、日历、相册、天气、设置（API、锁屏密码和壁纸、导出导入抹掉）。
- 2026-11-07 第二版（gray 第一次看完提的）：心电图图标；聊天发完自动回（删了 ✦）；引用（双方）；语音（文字 + 语气，双方）；表情包（全局共用，角色能发）；去掉红包；删了气泡样式选择，重做成一种（他白我黑）；长按气泡不再选中文字；角色能往日历里记日程，日程前面小圆圈打勾，日历小组件字放大；角色知道天气详情和日历完成情况；「角色的生活」从设置挪到每个角色资料里；天气搜城市去掉定位按钮、按人口排；头像、封面、壁纸都能裁剪，壁纸能调模糊；修了新建角色页底下冒 nullnull、菜单底色透字。

## 待办 / 以后再说

- [ ] 等 gray 真机反馈：键盘弹起时输入栏贴不贴键盘（`main.js` 的 `fitViewport`）、上滑解锁和横条的手感、裁剪的双指缩放、角色回复的格式稳不稳（尤其表情包名字、引用、日程）。
- [ ] 他的 API 能不能网页直连还不知道：连不上（跨域）就照 Game Over 的 `relay/` 做个中转。
- [ ] 世界书第一版没做（gray 说可有可无）。
- [ ] 换了网站图标后，iPhone 主屏幕上的书签要删掉重新「添加到主屏幕」才会变。
