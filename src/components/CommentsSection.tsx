import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Avatar from './Avatar';
import type { Comment } from '../types/database';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { hour12: false });

/**
 * 回答评论区（嵌入回答卡片底部）
 * - 一级评论 + 一级楼中楼回复（回复挂在根评论下，parent_id 指向根评论）
 * - 登录用户可发表评论/回复，作者可删除自己的评论
 */
export default function CommentsSection({ answerId }: { answerId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // 发表状态：replyTo 为 null 表示发表一级评论，否则回复该根评论
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from('qa_comments')
      .select('*, author:qa_profiles!author_id(*)')
      .eq('answer_id', answerId)
      .order('created_at', { ascending: true });
    setComments((data as Comment[]) ?? []);
    setLoaded(true);
  }, [answerId]);

  // 首次展开时才拉取，减少详情页首屏请求
  useEffect(() => {
    if (expanded && !loaded) fetchComments();
  }, [expanded, loaded, fetchComments]);

  const submit = async () => {
    if (!user) return;
    const text = content.trim();
    if (!text) return;
    setSubmitting(true);
    const { error } = await supabase.from('qa_comments').insert({
      answer_id: answerId,
      author_id: user.id,
      parent_id: replyTo?.id ?? null,
      content: text,
    });
    setSubmitting(false);
    if (error) {
      alert(error.message);
      return;
    }
    setContent('');
    setReplyTo(null);
    await fetchComments();
  };

  const remove = async (id: string) => {
    if (!window.confirm('确定删除该评论？其下回复将一并删除。')) return;
    const { error } = await supabase.from('qa_comments').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await fetchComments();
  };

  // 根评论与楼中楼分组（回复按钮只出现在根评论上，保证只有一层嵌套）
  const roots = comments.filter((c) => !c.parent_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id);

  const renderItem = (c: Comment, isReply: boolean) => (
    <div key={c.id} className={isReply ? 'ml-8' : undefined}>
      <div className="flex gap-2">
        <Avatar username={c.author?.username ?? '?'} avatarUrl={c.author?.avatar_url} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gray-500">
            <Link
              to={`/profile/${c.author_id}`}
              className="font-medium text-gray-700 hover:text-brand-600"
            >
              {c.author?.username}
            </Link>
            <span className="mx-1.5">·</span>
            {formatTime(c.created_at)}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-800">{c.content}</p>
          <div className="mt-1 flex gap-3 text-xs text-gray-400">
            {user && !isReply && (
              <button
                onClick={() => {
                  setReplyTo(c);
                  setContent('');
                }}
                className="hover:text-brand-600"
              >
                回复
              </button>
            )}
            {user?.id === c.author_id && (
              <button onClick={() => remove(c.id)} className="hover:text-red-600">
                删除
              </button>
            )}
          </div>
        </div>
      </div>
      {/* 楼中楼回复 */}
      {!isReply && (
        <div className="mt-3 space-y-3">{repliesOf(c.id).map((r) => renderItem(r, true))}</div>
      )}
    </div>
  );

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-sm text-gray-500 hover:text-brand-600"
      >
        {expanded ? '收起评论' : `查看评论${loaded && comments.length > 0 ? `（${comments.length}）` : ''}`}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {roots.length === 0 ? (
            <p className="text-sm text-gray-400">还没有评论</p>
          ) : (
            roots.map((c) => renderItem(c, false))
          )}

          {/* 发表框 */}
          {user ? (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              {replyTo && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  回复 <span className="font-medium text-gray-700">{replyTo.author?.username}</span>
                  <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-red-500">
                    ✕ 取消回复
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
                  }}
                  placeholder={replyTo ? `回复 ${replyTo.author?.username}…` : '写下你的评论…'}
                  maxLength={500}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                />
                <button
                  onClick={submit}
                  disabled={submitting || !content.trim()}
                  className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  发表
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              <Link to="/login" className="text-brand-600 hover:underline">
                登录
              </Link>{' '}
              后即可评论
            </p>
          )}
        </div>
      )}
    </div>
  );
}
