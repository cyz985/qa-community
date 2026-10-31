import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Markdown from '../components/Markdown';

const MAX_TAGS = 5;
const TAG_MAX_LEN = 20;

/**
 * 提问页（/ask）
 * 标题 5-150 字、Markdown 正文、标签（回车/逗号分隔）
 * 发布成功后触发器自动扣 5 积分，跳转到问题详情页
 */
export default function AskPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [preview, setPreview] = useState(false); // 正文编辑/预览切换
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /** 把一个标签加入列表（去重、限长、限量） */
  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^#/, '');
    if (!tag) return;
    if (tag.length > TAG_MAX_LEN) {
      setError(`标签「${tag}」过长，最多 ${TAG_MAX_LEN} 个字符`);
      return;
    }
    if (tags.includes(tag)) {
      setTagInput('');
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setError(`最多添加 ${MAX_TAGS} 个标签`);
      return;
    }
    setError('');
    setTags([...tags, tag]);
    setTagInput('');
  };

  /** 输入框按键：回车或逗号结束一个标签 */
  const onTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
      // 输入框为空时按退格，删除最后一个标签
      setTags(tags.slice(0, -1));
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    // 标签输入框里还有未确认的内容，一并收入
    const pending = tagInput.trim().replace(/^#/, '');
    const finalTags = pending && !tags.includes(pending) && tags.length < MAX_TAGS
      ? [...tags, pending]
      : tags;

    if (trimmedTitle.length < 5 || trimmedTitle.length > 150) {
      setError('标题长度需在 5-150 个字符之间');
      return;
    }
    if (!trimmedContent) {
      setError('正文不能为空');
      return;
    }

    setSubmitting(true);
    setError('');

    const { data, error: err } = await supabase
      .from('qa_questions')
      .insert({
        author_id: user.id,
        title: trimmedTitle,
        content: trimmedContent,
        tags: finalTags, // jsonb 数组
      })
      .select('id')
      .single();

    setSubmitting(false);

    if (err) {
      // 积分不足时触发器会抛错（points 不能为负），这里展示后端返回的信息
      setError(err.message.includes('points') ? '积分不足，无法发布问题（需要 5 积分）' : err.message);
      return;
    }
    navigate(`/question/${data.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-bold">发布问题</h1>
      <p className="mb-6 text-sm text-gray-500">
        发布问题将消耗 <span className="font-semibold text-orange-500">5 积分</span>
        （当前积分：{profile?.points ?? 0}），由数据库自动扣除
      </p>

      <form onSubmit={onSubmit} className="space-y-5">
        {/* 标题 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            标题 <span className="text-xs text-gray-400">（{title.trim().length}/150，至少 5 字）</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            placeholder="一句话说清楚你的问题，例如：React 中如何正确地防抖搜索输入？"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand-500"
          />
        </div>

        {/* 标签 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            标签 <span className="text-xs text-gray-400">（回车或逗号添加，最多 {MAX_TAGS} 个）</span>
          </label>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-brand-500">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((t) => t !== tag))}
                  className="text-brand-400 hover:text-brand-700"
                  aria-label={`移除标签 ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => addTag(tagInput)}
              placeholder={tags.length ? '' : '如：React, TypeScript'}
              className="min-w-[8rem] flex-1 outline-none"
            />
          </div>
        </div>

        {/* 正文：编辑 / 预览切换 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">正文（支持 Markdown）</label>
            <div className="flex rounded border border-gray-200 text-xs">
              <button
                type="button"
                onClick={() => setPreview(false)}
                className={`px-3 py-1 ${!preview ? 'bg-brand-600 text-white' : 'text-gray-600'}`}
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => setPreview(true)}
                className={`px-3 py-1 ${preview ? 'bg-brand-600 text-white' : 'text-gray-600'}`}
              >
                预览
              </button>
            </div>
          </div>
          {preview ? (
            <div className="min-h-[16rem] rounded-lg border border-gray-300 p-3">
              {content.trim() ? <Markdown content={content} /> : <p className="text-gray-400">暂无内容</p>}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder={'详细描述你的问题：\n\n- 你想实现什么？\n- 你尝试过什么方法？\n- 遇到了什么报错（贴出代码块 ```）？'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500"
            />
          )}
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-brand-600 px-6 py-2 text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? '发布中…' : '发布问题（-5 积分）'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:underline">
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
