import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/Avatar';
import EmptyState, { Loading } from '../components/EmptyState';
import type { Notification } from '../types/database';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { hour12: false });

/** 通知类型对应的文案前缀 */
const typeText: Record<Notification['type'], string> = {
  new_answer: '回答了你的问题',
  accept: '的回答被采纳为最佳答案',
  vote: '赞了你的内容',
};

/**
 * 通知中心（/notifications，受登录保护）
 * - 按时间倒序展示，未读高亮
 * - 点击单条标记已读并跳转对应问题；顶部可一键全部已读
 */
export default function NotificationsPage() {
  const { user } = useAuth();
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('qa_notifications')
      .select('*, actor:qa_profiles!actor_id(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setList((data as Notification[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /** 标记已读（列级授权仅允许更新 is_read） */
  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    await supabase.from('qa_notifications').update({ is_read: true }).in('id', ids);
    setList((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)));
  };

  const markAllRead = () => markRead(list.filter((n) => !n.is_read).map((n) => n.id));

  const unreadCount = list.filter((n) => !n.is_read).length;

  if (loading) return <Loading />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">通知中心{unreadCount > 0 && `（${unreadCount} 条未读）`}</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-sm text-brand-600 hover:underline">
            全部标为已读
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState text="暂时没有通知" />
      ) : (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {list.map((n) => (
            <Link
              key={n.id}
              to={n.question_id ? `/question/${n.question_id}` : '#'}
              onClick={() => {
                if (!n.is_read) markRead([n.id]);
              }}
              className={`flex items-start gap-3 px-5 py-4 hover:bg-gray-50 ${
                n.is_read ? 'opacity-60' : 'bg-brand-50/40'
              }`}
            >
              <Avatar username={n.actor?.username ?? '?'} avatarUrl={n.actor?.avatar_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800">
                  <span className="font-medium">{n.actor?.username ?? '有人'}</span>{' '}
                  {typeText[n.type]}
                </p>
                {n.content && (
                  <p className="mt-0.5 truncate text-sm text-gray-500">{n.content}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">{formatTime(n.created_at)}</p>
              </div>
              {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
