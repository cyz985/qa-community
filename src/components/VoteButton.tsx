import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { VoteTargetType } from '../types/database';

interface VoteButtonProps {
  targetType: VoteTargetType; // 'question' | 'answer'
  targetId: string;
  count: number; // 当前点赞数（父组件传入）
  /** 点赞状态变化成功后的回调，父组件一般用来刷新数据（vote_count 由触发器维护） */
  onChanged?: (voted: boolean) => void;
}

/**
 * 通用点赞按钮（问题 / 回答共用）
 * - 未登录点击 → 跳转登录页，登录后返回
 * - 一人一次：qa_votes 唯一约束保证，重复点击执行取消
 * - 计数与积分由数据库触发器维护，前端只负责 insert/delete
 */
export default function VoteButton({ targetType, targetId, count, onChanged }: VoteButtonProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);

  // 查询当前用户对该目标的点赞状态
  useEffect(() => {
    setVoted(false);
    if (!user) return;
    supabase
      .from('qa_votes')
      .select('id')
      .eq('user_id', user.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .maybeSingle()
      .then(({ data }) => setVoted(!!data));
  }, [user, targetType, targetId]);

  const toggle = async () => {
    if (!user) {
      // 未登录：跳登录页并记录来源，登录后自动返回本页
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    if (busy) return;
    setBusy(true);

    if (voted) {
      // 取消点赞：删除记录，触发器自动回退计数与积分
      const { error } = await supabase
        .from('qa_votes')
        .delete()
        .eq('user_id', user.id)
        .eq('target_type', targetType)
        .eq('target_id', targetId);
      if (!error) {
        setVoted(false);
        onChanged?.(false);
      }
    } else {
      // 点赞：插入记录，触发器自动 +1 计数并给作者加分；给自己的内容点赞会被触发器拒绝
      const { error } = await supabase
        .from('qa_votes')
        .insert({ user_id: user.id, target_type: targetType, target_id: targetId });
      if (!error) {
        setVoted(true);
        onChanged?.(true);
      } else if (error.code === '23505') {
        // 唯一约束冲突（并发重复点击），视为已赞
        setVoted(true);
      } else {
        alert(error.message);
      }
    }
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={voted ? '取消点赞' : '点赞'}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
        voted
          ? 'border-brand-600 bg-brand-50 text-brand-700'
          : 'border-gray-300 text-gray-600 hover:border-brand-400 hover:text-brand-600'
      }`}
    >
      <span>{voted ? '▲' : '△'}</span>
      <span className="font-semibold">{count}</span>
      <span>{voted ? '已赞' : '点赞'}</span>
    </button>
  );
}
