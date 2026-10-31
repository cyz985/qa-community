import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';

/**
 * 顶部导航栏
 * - 登录用户：显示提问按钮、排行榜、通知（含未读红点）、个人中心、退出
 * - 访客：显示登录/注册入口
 */
export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  // 查询未读通知数量（红点）
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .then(({ count }) => setUnread(count ?? 0));
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-10 border-b bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link to="/" className="text-lg font-bold text-brand-600">
          问答社区
        </Link>
        <nav className="flex items-center gap-4 text-sm text-gray-600">
          <Link to="/" className="hover:text-brand-600">问题</Link>
          <Link to="/leaderboard" className="hover:text-brand-600">排行榜</Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <Link
                to="/ask"
                className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
              >
                提问
              </Link>
              {/* 通知入口 + 未读红点 */}
              <Link to="/notifications" className="relative text-gray-600 hover:text-brand-600" title="通知">
                🔔
                {unread > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
              <Link to={`/profile/${user.id}`} className="flex items-center gap-1.5">
                <Avatar username={profile?.username ?? '?'} avatarUrl={profile?.avatar_url} size="sm" />
                <span className="hidden text-sm text-gray-700 sm:inline">{profile?.username}</span>
              </Link>
              <button onClick={handleSignOut} className="text-sm text-gray-500 hover:text-red-500">
                退出
              </button>
            </>
          ) : (
            <Link to="/login" className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">
              登录 / 注册
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
