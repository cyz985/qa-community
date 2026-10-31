/**
 * 数据库实体类型定义（与 supabase/schema.sql 保持一致）
 * 阶段1 文档：database.md
 */

// ---- profiles 用户资料 ----
export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string;
  points: number;
  created_at: string;
  updated_at: string;
}

// ---- questions 问题 ----
export interface Question {
  id: string;
  author_id: string;
  title: string;
  content: string;
  tags: string[]; // jsonb 数组，supabase-js 会自动解析为 string[]
  view_count: number;
  answer_count: number;
  vote_count: number;
  accepted_answer_id: string | null;
  is_solved: boolean;
  hot_score: number;
  created_at: string;
  updated_at: string;
  // 联表查询时附带的作者信息
  author?: Profile;
}

// ---- answers 回答 ----
export interface Answer {
  id: string;
  question_id: string;
  author_id: string;
  content: string;
  vote_count: number;
  is_accepted: boolean;
  created_at: string;
  updated_at: string;
  author?: Profile;
}

// ---- votes 点赞 ----
export type VoteTargetType = 'question' | 'answer';

export interface Vote {
  id: string;
  user_id: string;
  target_type: VoteTargetType;
  target_id: string;
  created_at: string;
}

// ---- comments 子评论 ----
export interface Comment {
  id: string;
  answer_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  author?: Profile;
}

// ---- follows 关注 ----
export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

// ---- notifications 通知 ----
export type NotificationType = 'new_answer' | 'accept' | 'vote';

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  question_id: string | null;
  answer_id: string | null;
  content: string;
  is_read: boolean;
  created_at: string;
  actor?: Profile;
}

// ---- badges 徽章 ----
export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  threshold: number;
  sort_order: number;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  unlocked_at: string;
  badge?: Badge;
}

// ---- RPC 返回类型 ----
export interface TagStat {
  tag: string;
  question_count: number;
}
