# 问答社区 · 数据库设计文档（database.md）

> 适用项目：问答社区全栈课程作业
> 技术方案：React + TypeScript + Vite + TailwindCSS + Supabase（不使用 Node/Express 后端）
> 数据库脚本：[supabase/schema.sql](supabase/schema.sql)

---

## 1. 设计概述

### 1.1 设计目标

| 目标 | 落地方式 |
| --- | --- |
| 复用 Supabase 账号体系 | 主数据来自 `auth.users`，业务扩展信息放在 `qa_profiles`，**不新建 users 表** |
| 业务逻辑下沉数据库 | 积分、点赞计数、采纳状态、通知、徽章全部由 **触发器 / RPC** 完成，前端只读 |
| 权限可控 | 所有表开启 RLS，配合列级授权（GRANT）限制可写字段 |
| 数据一致 | 点赞唯一约束 + 触发器在同一事务内维护计数与积分；采纳使用 RPC 校验 |
| 支持扩展功能 | 子评论、关注、通知、排行榜、徽章在初版表结构中一次性建好 |

### 1.2 架构说明

```
Supabase Auth (auth.users)
        │ 1:1（on delete cascade）
        ▼
   qa_profiles（积分 / 头像 / 简介）
        │
        ├── qa_questions ──< qa_answers ──< qa_comments
        │        │           │
        │        └──< qa_votes ─┘        （qa_votes 多态关联问题/回答）
        ├── qa_follows（follower_id → following_id）
        ├── qa_notifications（user_id 接收者 / actor_id 触发者）
        └── qa_user_badges >── qa_badges
```

所有对客户端的读写都通过 PostgREST（supabase-js），没有自建后端服务。

---

## 2. 数据表设计

### 2.1 qa_profiles —— 用户资料扩展表

| 字段 | 类型 | 约束 / 默认值 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK，`references auth.users(id) on delete cascade` | 与 Auth 用户一致 |
| username | text | not null，唯一，长度 2–30 | 展示名，注册时由触发器生成，可自行修改 |
| avatar_url | text | 可空 | 头像地址 |
| bio | text | not null default `''` | 个人简介 |
| points | integer | not null default 0 | 当前积分，**只能由触发器修改** |
| created_at | timestamptz | not null default now() | 注册时间 |
| updated_at | timestamptz | not null default now() | 由 `set_updated_at` 触发器维护 |

> 注册时由 `on_auth_user_created` 触发器自动插入一行；重名时自动追加 id 后缀。

### 2.2 qa_questions —— 问题表

| 字段 | 类型 | 约束 / 默认值 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK，default `gen_random_uuid()` | 问题 ID |
| author_id | uuid | not null，FK → qa_profiles | 提问者 |
| title | text | not null，长度 5–150 | 标题 |
| content | text | not null，长度 ≥ 1 | Markdown 正文 |
| tags | jsonb | not null default `'[]'`，必须是数组 | 标签 JSON 数组，如 `["React","TypeScript"]` |
| view_count | integer | not null default 0 | 浏览次数，由 RPC `increment_question_view` 累加 |
| answer_count | integer | not null default 0 | 回答数，由回答触发器维护 |
| vote_count | integer | not null default 0 | 点赞数，由点赞触发器维护 |
| accepted_answer_id | uuid | 可空，FK → qa_answers，`on delete set null` | 被采纳的最佳答案 |
| is_solved | boolean | not null default false | 是否已解决（采纳后为 true） |
| hot_score | bigint | 生成列，stored | `view_count + 2*vote_count + 3*answer_count`，用于热门排序 |
| created_at | timestamptz | not null default now() | 发布时间 |
| updated_at | timestamptz | not null default now() | 编辑时间 |

**唯一性约束**：`qa_answers` 表上有部分唯一索引 `qa_answers_one_accepted_idx`，保证每个问题最多一个被采纳回答。

### 2.3 qa_answers —— 回答表

| 字段 | 类型 | 约束 / 默认值 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK，default `gen_random_uuid()` | 回答 ID |
| question_id | uuid | not null，FK → qa_questions，`on delete cascade` | 所属问题 |
| author_id | uuid | not null，FK → qa_profiles | 回答者 |
| content | text | not null，长度 ≥ 1 | Markdown 正文 |
| vote_count | integer | not null default 0 | 点赞数，由触发器维护 |
| is_accepted | boolean | not null default false | 是否最佳答案，仅能通过 RPC 修改 |
| created_at | timestamptz | not null default now() | 回答时间 |
| updated_at | timestamptz | not null default now() | 编辑时间 |

> 同一用户对同一问题可以多次回答（无唯一约束）。

### 2.4 qa_votes —— 点赞表

| 字段 | 类型 | 约束 / 默认值 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK，default `gen_random_uuid()` | 点赞记录 ID |
| user_id | uuid | not null，FK → qa_profiles | 点赞者 |
| target_type | text | not null，`in ('question','answer')` | 点赞目标类型 |
| target_id | uuid | not null | 目标 ID（多态，不设外键） |
| created_at | timestamptz | not null default now() | 点赞时间 |

**唯一约束**：`qa_votes_unique_user_target (user_id, target_type, target_id)`，从数据库层面保证"一人一目标只能点赞一次"。
**删除约束**：目标被删除时，由触发器清理对应 qa_votes 记录。

### 2.5 qa_comments —— 回答的子评论

| 字段 | 类型 | 约束 / 默认值 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK，default `gen_random_uuid()` | 评论 ID |
| answer_id | uuid | not null，FK → qa_answers，`on delete cascade` | 所属回答 |
| author_id | uuid | not null，FK → qa_profiles | 评论者 |
| parent_id | uuid | 可空，FK → qa_comments，`on delete cascade` | 父评论，空表示一级评论 |
| content | text | not null，长度 ≥ 1 | 纯文本内容 |
| created_at | timestamptz | not null default now() | 评论时间 |

**完整性约束**：`qa_comments_validate_parent` 触发器保证父评论属于同一个回答，避免跨回答挂载。

### 2.6 qa_follows —— 用户关注

| 字段 | 类型 | 约束 / 默认值 | 说明 |
| --- | --- | --- | --- |
| follower_id | uuid | PK 组成，FK → qa_profiles | 关注者（粉丝） |
| following_id | uuid | PK 组成，FK → qa_profiles | 被关注者 |
| created_at | timestamptz | not null default now() | 关注时间 |

**约束**：复合主键 `(follower_id, following_id)` 保证不重复关注；`qa_follows_no_self` 禁止关注自己。

### 2.7 qa_notifications —— 消息通知

| 字段 | 类型 | 约束 / 默认值 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK，default `gen_random_uuid()` | 通知 ID |
| user_id | uuid | not null，FK → qa_profiles | 接收者 |
| actor_id | uuid | 可空，FK → qa_profiles，`on delete set null` | 触发者 |
| type | text | not null，`in ('new_answer','accept','vote')` | 通知类型 |
| question_id | uuid | 可空，FK → qa_questions，`on delete cascade` | 关联问题（用于跳转） |
| answer_id | uuid | 可空，FK → qa_answers，`on delete cascade` | 关联回答 |
| content | text | not null | 通知文案 |
| is_read | boolean | not null default false | 是否已读（红点依据） |
| created_at | timestamptz | not null default now() | 通知时间 |

**通知触发规则**：

| 事件 | type | 接收者 |
| --- | --- | --- |
| 有人回答了我的问题 | `new_answer` | 提问者 |
| 我的回答被采纳 | `accept` | 回答者 |
| 我的问题/回答收到点赞 | `vote` | 内容作者 |

> 自己操作自己的内容不会产生通知；通知只能由数据库触发器写入，客户端不能伪造。

### 2.8 qa_badges —— 徽章定义

| 字段 | 类型 | 约束 / 默认值 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK，default `gen_random_uuid()` | 徽章 ID |
| code | text | not null，唯一 | 徽章编码，如 `scholar` |
| name | text | not null | 名称 |
| description | text | not null | 解锁条件描述 |
| icon | text | not null | 图标（emoji） |
| threshold | integer | not null，≥ 0 | 解锁所需积分 |
| sort_order | integer | not null default 0 | 展示排序 |
| created_at | timestamptz | not null default now() | 创建时间 |

**种子数据（脚本自动写入）**

| code | 名称 | 图标 | 解锁积分 |
| --- | --- | --- | --- |
| seedling | 初出茅庐 | 🌱 | 0 |
| rising | 崭露头角 | 🌿 | 50 |
| scholar | 学有所成 | 🎓 | 150 |
| sage | 博学多才 | 🧠 | 400 |
| master | 社区大师 | 🏆 | 1000 |

### 2.9 qa_user_badges —— 用户徽章关联

| 字段 | 类型 | 约束 / 默认值 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK，default `gen_random_uuid()` | 记录 ID |
| user_id | uuid | not null，FK → qa_profiles | 用户 |
| badge_id | uuid | not null，FK → qa_badges | 徽章 |
| unlocked_at | timestamptz | not null default now() | 解锁时间 |

**约束**：`(user_id, badge_id)` 唯一；只允许触发器写入，客户端只读。

---

## 3. 索引设计

| 索引 | 表 | 字段 | 用途 |
| --- | --- | --- | --- |
| qa_questions_created_idx | qa_questions | created_at desc | 最新排序 |
| qa_questions_hot_idx | qa_questions | hot_score desc | 热门排序 |
| qa_questions_solved_idx | qa_questions | (is_solved, created_at desc) | 未解决筛选 |
| qa_questions_author_idx | qa_questions | (author_id, created_at desc) | 个人中心"我的提问" |
| qa_questions_tags_gin_idx | qa_questions | GIN(tags jsonb_path_ops) | 标签筛选 `tags @> '["x"]'` |
| qa_answers_question_idx | qa_answers | (question_id, created_at) | 详情页回答列表 |
| qa_answers_author_idx | qa_answers | (author_id, created_at desc) | "我的回答" |
| qa_answers_one_accepted_idx | qa_answers | 部分唯一 (question_id) where is_accepted | 每问唯一最佳答案 |
| qa_votes_target_idx | qa_votes | (target_type, target_id) | 统计/校验点赞 |
| qa_votes_user_idx | qa_votes | user_id | 查询当前用户点赞状态 |
| qa_comments_answer_idx | qa_comments | (answer_id, created_at) | 评论列表 |
| qa_comments_parent_idx | qa_comments | parent_id | 子回复嵌套 |
| qa_follows_following_idx | qa_follows | following_id | 粉丝列表 |
| qa_notifications_user_idx | qa_notifications | (user_id, created_at desc) | 通知列表 |
| qa_notifications_unread_idx | qa_notifications | (user_id, is_read) | 未读红点数量 |
| qa_user_badges_badge_idx | qa_user_badges | badge_id | 徽章持有者统计 |

---

## 4. 数据库函数（RPC）接口

| 函数 | 参数 | 返回 | 可调用角色 | 用途 |
| --- | --- | --- | --- | --- |
| `increment_question_view(question_id uuid)` | 问题 ID | void | anon / authenticated | 浏览次数 +1 |
| `get_all_tags()` | 无 | `table(tag text, question_count bigint)` | anon / authenticated | 标签云与筛选选项 |
| `accept_answer(answer_id uuid)` | 回答 ID | void | authenticated | 采纳最佳答案（内部校验提问者身份、是否已采纳） |

内部函数（不对客户端开放执行权限）：`award_points`、`unlock_qa_badges`、`handle_new_user`、各 `on_*` 触发器函数、`validate_comment_parent`、`set_updated_at`。

**客户端调用示例**

```ts
// 浏览计数
await supabase.rpc('increment_question_view', { question_id: id });

// 采纳答案
const { error } = await supabase.rpc('accept_answer', { answer_id: answerId });

// 标签列表
const { data: tags } = await supabase.rpc('get_all_tags');
```

---

## 5. 触发器设计

| 触发器 | 表 / 时机 | 逻辑 |
| --- | --- | --- |
| `qa_profiles_set_updated_at` | qa_profiles BEFORE UPDATE | 刷新 updated_at |
| `qa_questions_set_updated_at` | qa_questions BEFORE UPDATE | 刷新 updated_at |
| `qa_answers_set_updated_at` | qa_answers BEFORE UPDATE | 刷新 updated_at |
| `on_auth_user_created` | auth.users AFTER INSERT | 自动创建 qa_profiles（用户名冲突时加 id 后缀） |
| `qa_profiles_unlock_qa_badges` | qa_profiles AFTER INSERT / UPDATE OF points | 按积分自动写入 qa_user_badges |
| `qa_questions_on_created` | qa_questions AFTER INSERT | 提问者 **-5** 积分 |
| `qa_questions_on_deleted` | qa_questions AFTER DELETE | 清理问题相关的点赞记录 |
| `qa_answers_on_created` | qa_answers AFTER INSERT | 回答者 **+10**；`answer_count + 1`；给提问者发 `new_answer` 通知 |
| `qa_answers_on_accepted` | qa_answers AFTER UPDATE OF is_accepted | 回答者 **+30**；问题置为已解决；给回答者发 `accept` 通知 |
| `qa_answers_on_deleted` | qa_answers AFTER DELETE | `answer_count - 1`；若为最佳答案则取消已解决；清理该回答的点赞 |
| `qa_votes_on_created` | qa_votes AFTER INSERT | 目标 `vote_count + 1`；作者 **+5（问题）/ +10（回答）**；发送 `vote` 通知；禁止自赞 |
| `qa_votes_on_deleted` | qa_votes AFTER DELETE | 目标 `vote_count - 1`；回退对应积分 |
| `qa_comments_validate_parent` | qa_comments BEFORE INSERT | 校验父评论属于同一回答 |

> 所有触发器函数与 RPC 均为 `SECURITY DEFINER` 并固定 `search_path = public`，客户端无法直接调用积分函数。

---

## 6. 积分规则

| 行为 | 积分变化 | 实现位置 |
| --- | --- | --- |
| 发布问题 | -5 | `on_question_created` |
| 发布回答 | +10 | `on_answer_created` |
| 回答被采纳 | +30 | `on_answer_accepted` |
| 自己的问题被点赞 | +5 | `on_vote_created` |
| 自己的回答被点赞 | +10 | `on_vote_created` |
| 取消点赞 | 对应回退（-5 / -10） | `on_vote_deleted` |

补充说明：

1. 积分由数据库自动变更，前端只展示，不提供任何修改积分的入口。
2. 积分为累计值，允许因提问扣分出现负分（未设置积分下限）。
3. 禁止给自己发布的问题/回答点赞（触发器直接抛错），防止刷分。
4. 删除问题/回答不退还已获得的积分，仅回退"取消点赞"场景的积分。

---

## 7. RLS 权限矩阵

| 表 | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| qa_profiles | 所有人 | 无（仅注册触发器） | 仅本人，且只能改 `username/avatar_url/bio` | 无 |
| qa_questions | 所有人（含访客） | 登录用户，且 `author_id = auth.uid()` | 仅作者，且只能改 `title/content/tags` | 仅作者 |
| qa_answers | 所有人（含访客） | 登录用户，且 `author_id = auth.uid()` | 仅作者，且只能改 `content` | 仅作者 |
| qa_votes | 登录用户 | 登录用户，且 `user_id = auth.uid()` | 无 | 仅本人的点赞记录 |
| qa_comments | 所有人（含访客） | 登录用户，且 `author_id = auth.uid()` | 仅作者，仅 `content` | 仅作者 |
| qa_follows | 所有人（含访客） | 登录用户，`follower_id = auth.uid()` 且不能关注自己 | 无 | 仅本人关注关系 |
| qa_notifications | 仅接收者本人 | 无（仅触发器写入） | 仅本人，仅 `is_read` | 仅本人 |
| qa_badges | 所有人 | 无 | 无 | 无 |
| qa_user_badges | 所有人 | 无（仅触发器写入） | 无 | 无 |

**关键补充**

- 采纳答案只有提问者能执行，且只能采纳一次：`accept_answer` RPC 内部校验 + `qa_answers.is_accepted` 无客户端 UPDATE 列权限。
- 列级授权使"用户只能编辑自己的问题/回答"在字段层面也受到限制（不能改积分、点赞数、浏览数等）。
- 未登录访客只能执行 SELECT 与 `increment_question_view` / `get_all_tags`。

---

## 8. 数据一致性说明

1. **点赞**：唯一约束 + `qa_votes_on_created` / `qa_votes_on_deleted` 触发器在同一条 SQL 事务内维护 `vote_count`、积分与通知，任一失败整体回滚。
2. **采纳**：`accept_answer` 在单个事务中判断身份与是否已采纳，并更新 `is_accepted`；触发器随后维护问题状态。并发重复点击会被"已采纳"校验和部分唯一索引拦截。
3. **计数**：`answer_count` 由回答插入/删除触发器维护，`view_count` 由 RPC 维护，前端不直接写这些字段。
4. **删除级联**：问题删除 → 回答级联删除 → 评论、回答点赞级联清理；问题自身点赞由 `qa_questions_on_deleted` 清理。
5. **徽章**：积分每次变更后自动比对阈值写入 `qa_user_badges`，重复解锁由唯一约束阻止。

---

## 9. 部署步骤

1. 打开 Supabase Dashboard → SQL Editor → New query。
2. 复制 [supabase/schema.sql](supabase/schema.sql) 全文并执行（脚本适用于全新项目，只需执行一次）。
3. Authentication → Providers → Email 保持开启；课程演示可关闭 "Confirm email"，便于即时登录。
4. 在本地创建 `.env`（阶段2 提供 `.env.example` 模板）：
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=xxxx
   ```
   `.env` 必须写入 `.gitignore`，不得提交到 Git。
5. 验证：注册一个新账号 → 检查 `qa_profiles` 自动出现一行、`qa_user_badges` 出现"初出茅庐"徽章。

> 注意：脚本不要重复执行建表部分，否则会报 `relation already exists`；如需重建，请先手动删除相关表。
