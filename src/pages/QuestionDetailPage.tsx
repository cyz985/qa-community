import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Markdown from '../components/Markdown';
import TagChip from '../components/TagChip';
import Avatar from '../components/Avatar';
import VoteButton from '../components/VoteButton';
import CommentsSection from '../components/CommentsSection';
import EmptyState, { Loading } from '../components/EmptyState';
import type { Answer, Question } from '../types/database';

/** 时间显示 */
const formatTime = (iso: string) => new Date(iso).toLocaleString('zh-CN', { hour12: false });

/**
 * 问题详情页（/question/:id）
 * - 浏览计数：进入页面调用 RPC increment_question_view
 * - 回答列表：最佳答案置顶，其余按时间正序
 * - 点赞：VoteButton 组件，触发器维护计数与积分
 * - 采纳：仅提问者可见，调用 RPC accept_answer（同一问题仅一个最佳答案）
 * - 编辑/删除：仅内容作者可见
 */
export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [question, setQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 回答编辑器状态
  const [answerContent, setAnswerContent] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [answerError, setAnswerError] = useState('');

  // 问题编辑状态
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [editQTitle, setEditQTitle] = useState('');
  const [editQContent, setEditQContent] = useState('');
  const [editQTags, setEditQTags] = useState('');

  // 回答编辑状态（记录正在编辑的回答 id）
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const [editAContent, setEditAContent] = useState('');

  // 防止 StrictMode / 重复渲染导致同一页面重复计数
  const viewedRef = useRef<string | null>(null);

  /** 拉取问题（联表作者信息） */
  const fetchQuestion = useCallback(async () => {
    const { data, error } = await supabase
      .from('qa_questions')
      .select('*, author:qa_profiles!author_id(*)')
      .eq('id', id!)
      .maybeSingle();
    if (error || !data) {
      setNotFound(true);
      return;
    }
    setQuestion(data as Question);
  }, [id]);

  /** 拉取回答列表：最佳答案置顶，其余按时间正序 */
  const fetchAnswers = useCallback(async () => {
    const { data } = await supabase
      .from('qa_answers')
      .select('*, author:qa_profiles!author_id(*)')
      .eq('question_id', id!)
      .order('is_accepted', { ascending: false })
      .order('created_at', { ascending: true });
    setAnswers((data as Answer[]) ?? []);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    Promise.all([fetchQuestion(), fetchAnswers()]).finally(() => setLoading(false));

    // 浏览计数：同一问题在本页面实例只计一次，计数成功后乐观 +1 显示
    if (id && viewedRef.current !== id) {
      viewedRef.current = id;
      supabase.rpc('increment_question_view', { question_id: id }).then(({ error }) => {
        if (!error) {
          setQuestion((q) => (q ? { ...q, view_count: q.view_count + 1 } : q));
        }
      });
    }
  }, [id, fetchQuestion, fetchAnswers]);

  // ---------- 提问者操作：采纳最佳答案 ----------
  const acceptAnswer = async (answerId: string) => {
    if (!window.confirm('确定采纳该回答为最佳答案？采纳后不可更改。')) return;
    const { error } = await supabase.rpc('accept_answer', { answer_id: answerId });
    if (error) {
      alert(error.message);
      return;
    }
    // 采纳触发器：回答者 +30 积分、问题置为已解决
    await Promise.all([fetchQuestion(), fetchAnswers(), refreshProfile()]);
  };

  // ---------- 作者操作：编辑 / 删除问题 ----------
  const startEditQuestion = () => {
    if (!question) return;
    setEditQTitle(question.title);
    setEditQContent(question.content);
    setEditQTags(question.tags.join(', '));
    setEditingQuestion(true);
  };

  const saveQuestion = async () => {
    if (!question) return;
    const title = editQTitle.trim();
    const content = editQContent.trim();
    const tags = editQTags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    if (title.length < 5 || title.length > 150) {
      alert('标题长度需在 5-150 个字符之间');
      return;
    }
    if (!content) {
      alert('正文不能为空');
      return;
    }
    const { error } = await supabase
      .from('qa_questions')
      .update({ title, content, tags })
      .eq('id', question.id);
    if (error) {
      alert(error.message);
      return;
    }
    setEditingQuestion(false);
    await fetchQuestion();
  };

  const deleteQuestion = async () => {
    if (!question) return;
    if (!window.confirm('确定删除该问题？其下所有回答将一并删除。')) return;
    const { error } = await supabase.from('qa_questions').delete().eq('id', question.id);
    if (error) {
      alert(error.message);
      return;
    }
    navigate('/');
  };

  // ---------- 回答：发布 / 编辑 / 删除 ----------
  const submitAnswer = async () => {
    if (!user || !question) return;
    const content = answerContent.trim();
    if (!content) {
      setAnswerError('回答内容不能为空');
      return;
    }
    setSubmittingAnswer(true);
    setAnswerError('');
    const { error } = await supabase
      .from('qa_answers')
      .insert({ question_id: question.id, author_id: user.id, content });
    setSubmittingAnswer(false);
    if (error) {
      setAnswerError(error.message);
      return;
    }
    // 回答触发器：+10 积分、answer_count+1、给提问者发通知
    setAnswerContent('');
    await Promise.all([fetchQuestion(), fetchAnswers(), refreshProfile()]);
  };

  const saveAnswer = async (answerId: string) => {
    const content = editAContent.trim();
    if (!content) {
      alert('回答内容不能为空');
      return;
    }
    const { error } = await supabase.from('qa_answers').update({ content }).eq('id', answerId);
    if (error) {
      alert(error.message);
      return;
    }
    setEditingAnswerId(null);
    await fetchAnswers();
  };

  const deleteAnswer = async (answerId: string) => {
    if (!window.confirm('确定删除该回答？')) return;
    const { error } = await supabase.from('qa_answers').delete().eq('id', answerId);
    if (error) {
      alert(error.message);
      return;
    }
    // 删除触发器：answer_count-1；若删的是最佳答案，问题自动回到未解决
    await Promise.all([fetchQuestion(), fetchAnswers()]);
  };

  // ---------- 渲染 ----------
  if (loading) return <Loading />;
  if (notFound || !question) return <EmptyState text="问题不存在或已被删除" />;

  const isAuthor = user?.id === question.author_id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ===== 问题卡片 ===== */}
      <article className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold leading-snug">
            {question.is_solved && (
              <span className="mr-2 inline-block rounded bg-green-100 px-2 py-0.5 align-middle text-xs font-normal text-green-700">
                已解决
              </span>
            )}
            {question.title}
          </h1>
        </div>

        {/* 标签 */}
        {question.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {question.tags.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </div>
        )}

        {/* 作者与统计 */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          <Link to={`/profile/${question.author_id}`} className="flex items-center gap-1.5 hover:text-brand-600">
            <Avatar username={question.author?.username ?? '?'} avatarUrl={question.author?.avatar_url} size="sm" />
            <span>{question.author?.username}</span>
          </Link>
          <span>发布于 {formatTime(question.created_at)}</span>
          <span>👁 {question.view_count} 浏览</span>
          <span>💬 {question.answer_count} 回答</span>
        </div>

        {/* 正文（编辑模式切换） */}
        {editingQuestion ? (
          <div className="space-y-3">
            <input
              value={editQTitle}
              onChange={(e) => setEditQTitle(e.target.value)}
              maxLength={150}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand-500"
            />
            <input
              value={editQTags}
              onChange={(e) => setEditQTags(e.target.value)}
              placeholder="标签，用逗号分隔"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <textarea
              value={editQContent}
              onChange={(e) => setEditQContent(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500"
            />
            <div className="flex gap-2">
              <button onClick={saveQuestion} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700">
                保存
              </button>
              <button onClick={() => setEditingQuestion(false)} className="rounded-lg border px-4 py-1.5 text-sm text-gray-600">
                取消
              </button>
            </div>
          </div>
        ) : (
          <Markdown content={question.content} />
        )}

        {/* 操作行：点赞 + 作者操作 */}
        <div className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4">
          <VoteButton
            targetType="question"
            targetId={question.id}
            count={question.vote_count}
            onChanged={() => fetchQuestion()}
          />
          {isAuthor && !editingQuestion && (
            <>
              <button onClick={startEditQuestion} className="text-sm text-gray-500 hover:text-brand-600">
                编辑
              </button>
              <button onClick={deleteQuestion} className="text-sm text-gray-500 hover:text-red-600">
                删除
              </button>
            </>
          )}
        </div>
      </article>

      {/* ===== 回答列表 ===== */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">{answers.length} 个回答</h2>
        {answers.length === 0 ? (
          <EmptyState text="还没有回答，来写下第一个回答吧（+10 积分）" />
        ) : (
          <div className="space-y-4">
            {answers.map((answer) => (
              <article
                key={answer.id}
                className={`rounded-lg border bg-white p-5 ${
                  answer.is_accepted ? 'border-green-400 ring-1 ring-green-300' : 'border-gray-200'
                }`}
              >
                {answer.is_accepted && (
                  <div className="mb-2 flex items-center gap-1 text-sm font-medium text-green-700">
                    ✓ 最佳答案
                  </div>
                )}

                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                  <Link to={`/profile/${answer.author_id}`} className="flex items-center gap-1.5 hover:text-brand-600">
                    <Avatar username={answer.author?.username ?? '?'} avatarUrl={answer.author?.avatar_url} size="sm" />
                    <span>{answer.author?.username}</span>
                  </Link>
                  <span>{formatTime(answer.created_at)}</span>
                </div>

                {editingAnswerId === answer.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={editAContent}
                      onChange={(e) => setEditAContent(e.target.value)}
                      rows={6}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveAnswer(answer.id)}
                        className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingAnswerId(null)}
                        className="rounded-lg border px-4 py-1.5 text-sm text-gray-600"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <Markdown content={answer.content} />
                )}

                <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-3">
                  <VoteButton
                    targetType="answer"
                    targetId={answer.id}
                    count={answer.vote_count}
                    onChanged={() => fetchAnswers()}
                  />
                  {/* 采纳按钮：仅提问者、问题未解决、该回答未被采纳时可见 */}
                  {user?.id === question.author_id && !question.is_solved && !answer.is_accepted && (
                    <button
                      onClick={() => acceptAnswer(answer.id)}
                      className="rounded-lg border border-green-500 px-3 py-1.5 text-sm text-green-600 hover:bg-green-50"
                    >
                      采纳为最佳答案
                    </button>
                  )}
                  {user?.id === answer.author_id && editingAnswerId !== answer.id && (
                    <>
                      <button
                        onClick={() => {
                          setEditingAnswerId(answer.id);
                          setEditAContent(answer.content);
                        }}
                        className="text-sm text-gray-500 hover:text-brand-600"
                      >
                        编辑
                      </button>
                      <button onClick={() => deleteAnswer(answer.id)} className="text-sm text-gray-500 hover:text-red-600">
                        删除
                      </button>
                    </>
                  )}
                </div>

                {/* 评论区 */}
                <CommentsSection answerId={answer.id} />
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ===== 回答编辑器 ===== */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">写下你的回答</h2>
        {user ? (
          <div className="space-y-3">
            <textarea
              value={answerContent}
              onChange={(e) => setAnswerContent(e.target.value)}
              rows={6}
              placeholder="支持 Markdown。认真回答可获得 +10 积分，被采纳再得 +30 积分"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500"
            />
            {answerError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{answerError}</p>}
            <button
              onClick={submitAnswer}
              disabled={submittingAnswer}
              className="rounded-lg bg-brand-600 px-6 py-2 text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {submittingAnswer ? '提交中…' : '提交回答（+10 积分）'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            <Link to="/login" state={{ from: `/question/${question.id}` }} className="text-brand-600 hover:underline">
              登录
            </Link>{' '}
            后即可回答问题
          </p>
        )}
      </section>
    </div>
  );
}
