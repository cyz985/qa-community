import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/Avatar';
import EmptyState, { Loading } from '../components/EmptyState';
import type { Answer, Profile, Question } from '../types/database';

type Tab = 'questions' | 'answers';

/** 我的回答联表时需要的问题标题 */
interface MyAnswer extends Answer {
  question?: Pick<Question, 'id' | 'title'>;
}

const formatTime = (iso: string) => new Date(iso).toLocaleDateString('zh-CN');

/**
 * 个人中心（/profile/:id）
 * - 展示用户资料、积分、TA 的提问与回答
 * - 本人可编辑：用户名 / 头像 URL / 个人简介（列级授权仅开放这三个字段）
 */
export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, refreshProfile } = useAuth();
  const isSelf = user?.id === id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<MyAnswer[]>([]);
  const [tab, setTab] = useState<Tab>('questions');
  const [loading, setLoading] = useState(true);

  // 编辑资料状态
  const [editing, setEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saveError, setSaveError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [profileRes, questionsRes, answersRes] = await Promise.all([
      supabase.from('qa_profiles').select('*').eq('id', id!).maybeSingle(),
      supabase
        .from('qa_questions')
        .select('*')
        .eq('author_id', id!)
        .order('created_at', { ascending: false }),
      supabase
        .from('qa_answers')
        .select('*, question:qa_questions!question_id(id, title)')
        .eq('author_id', id!)
        .order('created_at', { ascending: false }),
    ]);
    setProfile(profileRes.data as Profile | null);
    setQuestions((questionsRes.data as Question[]) ?? []);
    setAnswers((answersRes.data as MyAnswer[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const startEdit = () => {
    if (!profile) return;
    setEditUsername(profile.username);
    setEditAvatar(profile.avatar_url ?? '');
    setEditBio(profile.bio);
    setSaveError('');
    setEditing(true);
  };

  const saveProfile = async () => {
    const username = editUsername.trim();
    if (username.length < 2 || username.length > 30) {
      setSaveError('用户名长度需在 2-30 个字符之间');
      return;
    }
    // 列级授权：只能更新 username / avatar_url / bio
    const { error } = await supabase
      .from('qa_profiles')
      .update({ username, avatar_url: editAvatar.trim() || null, bio: editBio.trim() })
      .eq('id', id!);
    if (error) {
      setSaveError(error.code === '23505' ? '该用户名已被占用' : error.message);
      return;
    }
    setEditing(false);
    await fetchAll();
    if (isSelf) await refreshProfile(); // 同步顶栏头像/用户名
  };

  if (loading) return <Loading />;
  if (!profile) return <EmptyState text="用户不存在" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ===== 资料卡片 ===== */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">用户名</label>
              <input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                maxLength={30}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">头像 URL</label>
              <input
                value={editAvatar}
                onChange={(e) => setEditAvatar(e.target.value)}
                placeholder="https://…（留空则使用首字符占位）"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">个人简介</label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand-500"
              />
            </div>
            {saveError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</p>}
            <div className="flex gap-2">
              <button onClick={saveProfile} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700">
                保存
              </button>
              <button onClick={() => setEditing(false)} className="rounded-lg border px-4 py-1.5 text-sm text-gray-600">
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <Avatar username={profile.username} avatarUrl={profile.avatar_url} size="lg" />
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold">{profile.username}</h1>
                <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-sm font-semibold text-orange-600">
                  ⭐ {profile.points} 积分
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">{profile.bio || '这个人很懒，什么都没有留下'}</p>
              <p className="mt-1 text-xs text-gray-400">加入于 {formatTime(profile.created_at)}</p>
            </div>
            {isSelf && (
              <button onClick={startEdit} className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600">
                编辑资料
              </button>
            )}
          </div>
        )}
      </section>

      {/* ===== Tab：TA 的提问 / TA 的回答 ===== */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTab('questions')}
            className={`px-5 py-3 text-sm font-medium ${
              tab === 'questions' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-500'
            }`}
          >
            提问（{questions.length}）
          </button>
          <button
            onClick={() => setTab('answers')}
            className={`px-5 py-3 text-sm font-medium ${
              tab === 'answers' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-500'
            }`}
          >
            回答（{answers.length}）
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {tab === 'questions' &&
            (questions.length === 0 ? (
              <div className="p-6"><EmptyState text="还没有提问" /></div>
            ) : (
              questions.map((q) => (
                <Link key={q.id} to={`/question/${q.id}`} className="block px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    {q.is_solved && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">已解决</span>
                    )}
                    <span className="font-medium text-gray-800">{q.title}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {formatTime(q.created_at)} · {q.answer_count} 回答 · {q.vote_count} 赞 · {q.view_count} 浏览
                  </div>
                </Link>
              ))
            ))}

          {tab === 'answers' &&
            (answers.length === 0 ? (
              <div className="p-6"><EmptyState text="还没有回答" /></div>
            ) : (
              answers.map((a) => (
                <Link key={a.id} to={`/question/${a.question_id}`} className="block px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    {a.is_accepted && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">✓ 最佳答案</span>
                    )}
                    <span className="text-sm text-gray-500">回答了：</span>
                    <span className="font-medium text-gray-800">{a.question?.title ?? '（问题已删除）'}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600">{a.content}</p>
                  <div className="mt-1 text-xs text-gray-400">
                    {formatTime(a.created_at)} · {a.vote_count} 赞
                  </div>
                </Link>
              ))
            ))}
        </div>
      </section>
    </div>
  );
}
