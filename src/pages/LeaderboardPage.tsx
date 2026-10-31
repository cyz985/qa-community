import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import EmptyState, { Loading } from '../components/EmptyState';
import type { Profile } from '../types/database';

/** 名次奖牌（前三名） */
const rankBadge = (rank: number) => {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
};

/**
 * 积分排行榜（/leaderboard，公开）
 * - 按积分倒序取前 50 名
 */
export default function LeaderboardPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('qa_profiles')
      .select('*')
      .order('points', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setUsers((data as Profile[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) return <Loading />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-bold">🏆 积分排行榜</h1>

      {users.length === 0 ? (
        <EmptyState text="还没有用户上榜" />
      ) : (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {users.map((u, i) => {
            const rank = i + 1;
            const medal = rankBadge(rank);
            return (
              <Link
                key={u.id}
                to={`/profile/${u.id}`}
                className={`flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 ${
                  rank <= 3 ? 'bg-yellow-50/50' : ''
                }`}
              >
                <span className="w-8 text-center text-sm font-bold text-gray-500">
                  {medal ?? rank}
                </span>
                <Avatar username={u.username} avatarUrl={u.avatar_url} size="sm" />
                <span className="flex-1 truncate font-medium text-gray-800">{u.username}</span>
                <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-sm font-semibold text-orange-600">
                  ⭐ {u.points}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
