-- =====================================================================
-- 问答社区 · Supabase 数据库初始化脚本（阶段1）
-- 使用方式：Supabase Dashboard → SQL Editor → New query → 粘贴全文 → Run
-- 执行身份：项目 Owner（postgres），脚本内的 SECURITY DEFINER 函数会以该身份运行
-- 注意：本脚本假设项目为全新数据库，请勿重复执行建表部分
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 一、数据表
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. qa_profiles：用户资料扩展表（主键复用 auth.users.id，不新建用户表）
-- ---------------------------------------------------------------
create table public.qa_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  avatar_url  text,
  bio         text not null default '',
  points      integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint qa_profiles_username_unique unique (username),
  constraint qa_profiles_username_len check (char_length(username) between 2 and 30)
);

comment on table public.qa_profiles is '用户资料扩展表，积分/头像/徽章信息，主键关联 auth.users';
comment on column public.qa_profiles.points is '当前积分，只能由触发器修改，前端只读';

-- ---------------------------------------------------------------
-- 2. qa_questions：问题表
-- ---------------------------------------------------------------
create table public.qa_questions (
  id                 uuid primary key default gen_random_uuid(),
  author_id          uuid not null references public.qa_profiles(id) on delete cascade,
  title              text not null,
  content            text not null,
  tags               jsonb not null default '[]'::jsonb,
  view_count         integer not null default 0,
  answer_count       integer not null default 0,
  vote_count         integer not null default 0,
  accepted_answer_id uuid,
  is_solved          boolean not null default false,
  hot_score          bigint generated always as (
                       view_count::bigint + vote_count::bigint * 2 + answer_count::bigint * 3
                     ) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint qa_questions_title_len check (char_length(title) between 5 and 150),
  constraint qa_questions_content_len check (char_length(content) >= 1),
  constraint qa_questions_tags_array check (jsonb_typeof(tags) = 'array')
);

comment on table public.qa_questions is '问题表，tags 存储标签 JSON 数组';
comment on column public.qa_questions.hot_score is '热度值 = 浏览 + 2*点赞 + 3*回答，用于热门排序';

-- ---------------------------------------------------------------
-- 3. qa_answers：回答表
-- ---------------------------------------------------------------
create table public.qa_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  author_id   uuid not null references public.qa_profiles(id) on delete cascade,
  content     text not null,
  vote_count  integer not null default 0,
  is_accepted boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint qa_answers_content_len check (char_length(content) >= 1)
);

comment on table public.qa_answers is '回答表，同一用户可对同一问题多次回答';

-- 问题表的最佳答案外键（建表后补加，避免循环依赖）
alter table public.qa_questions
  add constraint qa_questions_accepted_answer_fk
  foreign key (accepted_answer_id) references public.qa_answers(id) on delete set null;

-- ---------------------------------------------------------------
-- 4. qa_votes：点赞表（问题/回答共用，多态关联）
-- ---------------------------------------------------------------
create table public.qa_votes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.qa_profiles(id) on delete cascade,
  target_type text not null,
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  constraint qa_votes_target_type check (target_type in ('question', 'answer')),
  constraint qa_votes_unique_user_target unique (user_id, target_type, target_id)
);

comment on table public.qa_votes is '点赞记录，唯一约束保证一个用户对同一目标只能点赞一次';

-- ---------------------------------------------------------------
-- 5. qa_comments：回答的子评论（parent_id 支持多级回复）
-- ---------------------------------------------------------------
create table public.qa_comments (
  id          uuid primary key default gen_random_uuid(),
  answer_id   uuid not null references public.qa_answers(id) on delete cascade,
  author_id   uuid not null references public.qa_profiles(id) on delete cascade,
  parent_id   uuid references public.qa_comments(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  constraint qa_comments_content_len check (char_length(content) >= 1)
);

-- ---------------------------------------------------------------
-- 6. qa_follows：用户关注关系
-- ---------------------------------------------------------------
create table public.qa_follows (
  follower_id  uuid not null references public.qa_profiles(id) on delete cascade,
  following_id uuid not null references public.qa_profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint qa_follows_no_self check (follower_id <> following_id)
);

-- ---------------------------------------------------------------
-- 7. qa_notifications：消息通知
-- ---------------------------------------------------------------
create table public.qa_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.qa_profiles(id) on delete cascade, -- 接收者
  actor_id    uuid references public.qa_profiles(id) on delete set null,         -- 触发者
  type        text not null,                                                 -- new_answer / accept / vote
  question_id uuid references public.qa_questions(id) on delete cascade,
  answer_id   uuid references public.qa_answers(id) on delete cascade,
  content     text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint qa_notifications_type check (type in ('new_answer', 'accept', 'vote'))
);

-- ---------------------------------------------------------------
-- 8. qa_badges：徽章定义
-- ---------------------------------------------------------------
create table public.qa_badges (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text not null,
  icon        text not null,
  threshold   integer not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint qa_badges_threshold_nonnegative check (threshold >= 0)
);

-- ---------------------------------------------------------------
-- 9. qa_user_badges：用户-徽章关联（由触发器自动写入）
-- ---------------------------------------------------------------
create table public.qa_user_badges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.qa_profiles(id) on delete cascade,
  badge_id    uuid not null references public.qa_badges(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  constraint qa_user_badges_unique unique (user_id, badge_id)
);

-- =====================================================================
-- 二、索引
-- =====================================================================

create index qa_questions_created_idx on public.qa_questions (created_at desc);
create index qa_questions_hot_idx on public.qa_questions (hot_score desc);
create index qa_questions_solved_idx on public.qa_questions (is_solved, created_at desc);
create index qa_questions_author_idx on public.qa_questions (author_id, created_at desc);
create index qa_questions_tags_gin_idx on public.qa_questions using gin (tags jsonb_path_ops);

create index qa_answers_question_idx on public.qa_answers (question_id, created_at);
create index qa_answers_author_idx on public.qa_answers (author_id, created_at desc);
create unique index qa_answers_one_accepted_idx on public.qa_answers (question_id) where is_accepted;

create index qa_votes_target_idx on public.qa_votes (target_type, target_id);
create index qa_votes_user_idx on public.qa_votes (user_id);

create index qa_comments_answer_idx on public.qa_comments (answer_id, created_at);
create index qa_comments_parent_idx on public.qa_comments (parent_id);
create index qa_comments_author_idx on public.qa_comments (author_id);

create index qa_follows_following_idx on public.qa_follows (following_id);

create index qa_notifications_user_idx on public.qa_notifications (user_id, created_at desc);
create index qa_notifications_unread_idx on public.qa_notifications (user_id, is_read);

create index qa_user_badges_badge_idx on public.qa_user_badges (badge_id);

-- =====================================================================
-- 三、函数（工具函数 + RPC）
-- =====================================================================

-- 自动维护 updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 积分变更统一入口（只允许触发器等内部逻辑调用）
create or replace function public.award_points(target_user uuid, delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.qa_profiles
     set points = points + delta
   where id = target_user;
end;
$$;

-- 积分变化后自动解锁徽章
create or replace function public.unlock_qa_badges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.qa_user_badges (user_id, badge_id)
  select new.id, b.id
    from public.qa_badges b
   where b.threshold <= new.points
     and not exists (
       select 1 from public.qa_user_badges ub
        where ub.user_id = new.id and ub.badge_id = b.id
     );
  return new;
end;
$$;

-- 注册成功后自动创建 qa_profiles 记录
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
begin
  base_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  );
  base_name := left(base_name, 24);

  if char_length(base_name) < 2 then
    base_name := base_name || left(new.id::text, 4);
  end if;

  begin
    insert into public.qa_profiles (id, username) values (new.id, base_name);
  exception when unique_violation then
    insert into public.qa_profiles (id, username)
    values (new.id, base_name || '_' || left(new.id::text, 4));
  end;

  return new;
end;
$$;

-- 发布问题：-5 积分
create or replace function public.on_question_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_points(new.author_id, -5);
  return new;
end;
$$;

-- 发布回答：+10 积分；维护回答数；通知提问者
create or replace function public.on_answer_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_title  text;
begin
  select q.author_id, q.title into v_author, v_title
    from public.qa_questions q
   where q.id = new.question_id;

  perform public.award_points(new.author_id, 10);

  update public.qa_questions
     set answer_count = answer_count + 1
   where id = new.question_id;

  if v_author is distinct from new.author_id then
    insert into public.qa_notifications (user_id, actor_id, type, question_id, answer_id, content)
    values (v_author, new.author_id, 'new_answer', new.question_id, new.id,
            '你的问题《' || v_title || '》收到了新回答');
  end if;

  return new;
end;
$$;

-- 回答被采纳：+30 积分；标记问题已解决；通知回答者
create or replace function public.on_answer_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_author uuid;
begin
  if new.is_accepted and not old.is_accepted then
    perform public.award_points(new.author_id, 30);

    update public.qa_questions
       set accepted_answer_id = new.id,
           is_solved = true
     where id = new.question_id;

    select q.author_id into v_question_author
      from public.qa_questions q
     where q.id = new.question_id;

    if v_question_author is distinct from new.author_id then
      insert into public.qa_notifications (user_id, actor_id, type, question_id, answer_id, content)
      values (new.author_id, v_question_author, 'accept', new.question_id, new.id,
              '你的回答被采纳为最佳答案');
    end if;
  end if;

  return new;
end;
$$;

-- 删除回答：维护回答数；若为最佳答案则取消问题已解决状态；清理回答的点赞记录
create or replace function public.on_answer_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.qa_questions
     set answer_count = greatest(answer_count - 1, 0)
   where id = old.question_id;

  if old.is_accepted then
    update public.qa_questions
       set accepted_answer_id = null,
           is_solved = false
     where id = old.question_id;
  end if;

  delete from public.qa_votes
   where target_type = 'answer' and target_id = old.id;

  return old;
end;
$$;

-- 删除问题：清理问题本身的点赞记录
create or replace function public.on_question_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.qa_votes
   where target_type = 'question' and target_id = old.id;
  return old;
end;
$$;

-- 点赞：计数 +1；给内容作者加/减积分；写入通知；禁止自赞
create or replace function public.on_vote_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author      uuid;
  v_title       text;
  v_question_id uuid;
  v_points      integer;
begin
  if new.target_type = 'question' then
    select q.author_id, q.title into v_author, v_title
      from public.qa_questions q
     where q.id = new.target_id;

    if v_author is null then
      raise exception '点赞目标不存在';
    end if;
    if v_author = new.user_id then
      raise exception '不能给自己的内容点赞';
    end if;

    update public.qa_questions
       set vote_count = vote_count + 1
     where id = new.target_id;

    v_points := 5;

    insert into public.qa_notifications (user_id, actor_id, type, question_id, content)
    values (v_author, new.user_id, 'vote', new.target_id,
            '你的问题《' || v_title || '》收到了一个赞');
  else
    select a.author_id, a.question_id into v_author, v_question_id
      from public.qa_answers a
     where a.id = new.target_id;

    if v_author is null then
      raise exception '点赞目标不存在';
    end if;
    if v_author = new.user_id then
      raise exception '不能给自己的内容点赞';
    end if;

    update public.qa_answers
       set vote_count = vote_count + 1
     where id = new.target_id;

    v_points := 10;

    insert into public.qa_notifications (user_id, actor_id, type, question_id, answer_id, content)
    values (v_author, new.user_id, 'vote', v_question_id, new.target_id,
            '你的回答收到了一个赞');
  end if;

  perform public.award_points(v_author, v_points);
  return new;
end;
$$;

-- 取消点赞：计数 -1；回退点赞积分
create or replace function public.on_vote_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_points integer;
begin
  if old.target_type = 'question' then
    select q.author_id into v_author
      from public.qa_questions q
     where q.id = old.target_id;

    update public.qa_questions
       set vote_count = greatest(vote_count - 1, 0)
     where id = old.target_id;

    v_points := 5;
  else
    select a.author_id into v_author
      from public.qa_answers a
     where a.id = old.target_id;

    update public.qa_answers
       set vote_count = greatest(vote_count - 1, 0)
     where id = old.target_id;

    v_points := 10;
  end if;

  if v_author is not null and v_author <> old.user_id then
    perform public.award_points(v_author, -v_points);
  end if;

  return old;
end;
$$;

-- 子评论校验：父评论必须属于同一个回答
create or replace function public.validate_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer_id uuid;
begin
  if new.parent_id is not null then
    select c.answer_id into v_answer_id
      from public.qa_comments c
     where c.id = new.parent_id;

    if v_answer_id is null or v_answer_id <> new.answer_id then
      raise exception '父评论不存在或不属于同一个回答';
    end if;
  end if;

  return new;
end;
$$;

-- RPC：浏览次数 +1（访客可调用）
create or replace function public.increment_question_view(question_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.qa_questions
     set view_count = view_count + 1
   where id = question_id;
end;
$$;

-- RPC：采纳最佳答案（仅提问者，且只能采纳一次）
create or replace function public.accept_answer(answer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer   public.qa_answers;
  v_question public.qa_questions;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  select * into v_answer from public.qa_answers where id = answer_id;

  if not found then
    raise exception '回答不存在';
  end if;

  select * into v_question from public.qa_questions where id = v_answer.question_id;

  if v_question.author_id <> auth.uid() then
    raise exception '只有提问者才能采纳答案';
  end if;

  if v_question.accepted_answer_id is not null then
    raise exception '该问题已采纳最佳答案';
  end if;

  update public.qa_answers
     set is_accepted = true
   where id = answer_id;
end;
$$;

-- RPC：获取全部标签及问题数量（访客可调用）
create or replace function public.get_all_tags()
returns table (tag text, question_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select t.tag, count(*)::bigint as question_count
    from public.qa_questions q
    cross join lateral jsonb_array_elements_text(q.tags) as t(tag)
   group by t.tag
   order by 2 desc, 1 asc;
$$;

-- =====================================================================
-- 四、触发器
-- =====================================================================

drop trigger if exists qa_profiles_set_updated_at on public.qa_profiles;
create trigger qa_profiles_set_updated_at
before update on public.qa_profiles
for each row execute function public.set_updated_at();

drop trigger if exists qa_questions_set_updated_at on public.qa_questions;
create trigger qa_questions_set_updated_at
before update on public.qa_questions
for each row execute function public.set_updated_at();

drop trigger if exists qa_answers_set_updated_at on public.qa_answers;
create trigger qa_answers_set_updated_at
before update on public.qa_answers
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists qa_profiles_unlock_qa_badges on public.qa_profiles;
create trigger qa_profiles_unlock_qa_badges
after insert or update of points on public.qa_profiles
for each row execute function public.unlock_qa_badges();

drop trigger if exists qa_questions_on_created on public.qa_questions;
create trigger qa_questions_on_created
after insert on public.qa_questions
for each row execute function public.on_question_created();

drop trigger if exists qa_questions_on_deleted on public.qa_questions;
create trigger qa_questions_on_deleted
after delete on public.qa_questions
for each row execute function public.on_question_deleted();

drop trigger if exists qa_answers_on_created on public.qa_answers;
create trigger qa_answers_on_created
after insert on public.qa_answers
for each row execute function public.on_answer_created();

drop trigger if exists qa_answers_on_accepted on public.qa_answers;
create trigger qa_answers_on_accepted
after update of is_accepted on public.qa_answers
for each row execute function public.on_answer_accepted();

drop trigger if exists qa_answers_on_deleted on public.qa_answers;
create trigger qa_answers_on_deleted
after delete on public.qa_answers
for each row execute function public.on_answer_deleted();

drop trigger if exists qa_votes_on_created on public.qa_votes;
create trigger qa_votes_on_created
after insert on public.qa_votes
for each row execute function public.on_vote_created();

drop trigger if exists qa_votes_on_deleted on public.qa_votes;
create trigger qa_votes_on_deleted
after delete on public.qa_votes
for each row execute function public.on_vote_deleted();

drop trigger if exists qa_comments_validate_parent on public.qa_comments;
create trigger qa_comments_validate_parent
before insert on public.qa_comments
for each row execute function public.validate_comment_parent();

-- =====================================================================
-- 五、权限（GRANT）与 RLS
-- =====================================================================

grant usage on schema public to anon, authenticated;

-- ---- qa_profiles ----
revoke all on public.qa_profiles from anon, authenticated;
grant select on public.qa_profiles to anon, authenticated;
grant update (username, avatar_url, bio) on public.qa_profiles to authenticated;

alter table public.qa_profiles enable row level security;

create policy "qa_profiles_select_all"
  on public.qa_profiles for select
  to anon, authenticated
  using (true);

create policy "qa_profiles_update_self"
  on public.qa_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- qa_questions ----
revoke all on public.qa_questions from anon, authenticated;
grant select on public.qa_questions to anon, authenticated;
grant insert, delete on public.qa_questions to authenticated;
grant update (title, content, tags) on public.qa_questions to authenticated;

alter table public.qa_questions enable row level security;

create policy "qa_questions_select_all"
  on public.qa_questions for select
  to anon, authenticated
  using (true);

create policy "qa_questions_insert_auth"
  on public.qa_questions for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "qa_questions_update_own"
  on public.qa_questions for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "qa_questions_delete_own"
  on public.qa_questions for delete
  to authenticated
  using (author_id = auth.uid());

-- ---- qa_answers ----
revoke all on public.qa_answers from anon, authenticated;
grant select on public.qa_answers to anon, authenticated;
grant insert, delete on public.qa_answers to authenticated;
grant update (content) on public.qa_answers to authenticated;

alter table public.qa_answers enable row level security;

create policy "qa_answers_select_all"
  on public.qa_answers for select
  to anon, authenticated
  using (true);

create policy "qa_answers_insert_auth"
  on public.qa_answers for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "qa_answers_update_own"
  on public.qa_answers for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "qa_answers_delete_own"
  on public.qa_answers for delete
  to authenticated
  using (author_id = auth.uid());

-- ---- qa_votes ----
revoke all on public.qa_votes from anon, authenticated;
grant select, insert, delete on public.qa_votes to authenticated;

alter table public.qa_votes enable row level security;

create policy "qa_votes_select_auth"
  on public.qa_votes for select
  to authenticated
  using (true);

create policy "qa_votes_insert_own"
  on public.qa_votes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "qa_votes_delete_own"
  on public.qa_votes for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- qa_comments ----
revoke all on public.qa_comments from anon, authenticated;
grant select on public.qa_comments to anon, authenticated;
grant insert, delete on public.qa_comments to authenticated;
grant update (content) on public.qa_comments to authenticated;

alter table public.qa_comments enable row level security;

create policy "qa_comments_select_all"
  on public.qa_comments for select
  to anon, authenticated
  using (true);

create policy "qa_comments_insert_auth"
  on public.qa_comments for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "qa_comments_update_own"
  on public.qa_comments for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "qa_comments_delete_own"
  on public.qa_comments for delete
  to authenticated
  using (author_id = auth.uid());

-- ---- qa_follows ----
revoke all on public.qa_follows from anon, authenticated;
grant select on public.qa_follows to anon, authenticated;
grant insert, delete on public.qa_follows to authenticated;

alter table public.qa_follows enable row level security;

create policy "qa_follows_select_all"
  on public.qa_follows for select
  to anon, authenticated
  using (true);

create policy "qa_follows_insert_own"
  on public.qa_follows for insert
  to authenticated
  with check (follower_id = auth.uid() and following_id <> auth.uid());

create policy "qa_follows_delete_own"
  on public.qa_follows for delete
  to authenticated
  using (follower_id = auth.uid());

-- ---- qa_notifications ----
revoke all on public.qa_notifications from anon, authenticated;
grant select, delete on public.qa_notifications to authenticated;
grant update (is_read) on public.qa_notifications to authenticated;

alter table public.qa_notifications enable row level security;

create policy "qa_notifications_select_own"
  on public.qa_notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "qa_notifications_update_own"
  on public.qa_notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "qa_notifications_delete_own"
  on public.qa_notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- qa_badges ----
revoke all on public.qa_badges from anon, authenticated;
grant select on public.qa_badges to anon, authenticated;

alter table public.qa_badges enable row level security;

create policy "qa_badges_select_all"
  on public.qa_badges for select
  to anon, authenticated
  using (true);

-- ---- qa_user_badges ----
revoke all on public.qa_user_badges from anon, authenticated;
grant select on public.qa_user_badges to anon, authenticated;

alter table public.qa_user_badges enable row level security;

create policy "qa_user_badges_select_all"
  on public.qa_user_badges for select
  to anon, authenticated
  using (true);

-- =====================================================================
-- 六、函数执行权限
-- =====================================================================

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.award_points(uuid, integer) from public, anon, authenticated;
revoke execute on function public.unlock_qa_badges() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.on_question_created() from public, anon, authenticated;
revoke execute on function public.on_answer_created() from public, anon, authenticated;
revoke execute on function public.on_answer_accepted() from public, anon, authenticated;
revoke execute on function public.on_answer_deleted() from public, anon, authenticated;
revoke execute on function public.on_question_deleted() from public, anon, authenticated;
revoke execute on function public.on_vote_created() from public, anon, authenticated;
revoke execute on function public.on_vote_deleted() from public, anon, authenticated;
revoke execute on function public.validate_comment_parent() from public, anon, authenticated;

revoke execute on function public.accept_answer(uuid) from public, anon;
grant execute on function public.accept_answer(uuid) to authenticated;

grant execute on function public.increment_question_view(uuid) to anon, authenticated;
grant execute on function public.get_all_tags() to anon, authenticated;

-- =====================================================================
-- 七、徽章种子数据
-- =====================================================================

insert into public.qa_badges (code, name, description, icon, threshold, sort_order)
values
  ('seedling', '初出茅庐', '完成注册，正式加入社区', '🌱', 0,    1),
  ('rising',   '崭露头角', '累计获得 50 积分',           '🌿', 50,   2),
  ('scholar',  '学有所成', '累计获得 150 积分',          '🎓', 150,  3),
  ('sage',     '博学多才', '累计获得 400 积分',          '🧠', 400,  4),
  ('master',   '社区大师', '累计获得 1000 积分',         '🏆', 1000, 5)
on conflict (code) do nothing;

-- 为脚本执行前已存在的 auth 用户补建 qa_profiles（全新项目可忽略）
insert into public.qa_profiles (id, username)
select u.id,
       left(coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'user'), 24)
       || '_' || left(u.id::text, 4)
  from auth.users u
 where not exists (select 1 from public.qa_profiles p where p.id = u.id)
on conflict do nothing;

-- =====================================================================
-- 脚本结束
-- 下一步：Supabase → Authentication → Providers 开启 Email；
--        如用于演示可关闭 Confirm email，便于快速注册登录。
-- =====================================================================
