import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Question, TagStat } from '../types/database';
import TagChip from '../components/TagChip';
import Avatar from '../components/Avatar';
import Pagination from '../components/Pagination';
import EmptyState, { Loading } from '../components/EmptyState';

type SortKey = 'latest' | 'hot' | 'unsolved';

const PAGE_SIZE = 10;

const SORT_TABS: { key: SortKey; label: string }[] = [
  { key: 'latest', label: '最新' },
  { key: 'hot', label: '热门' },
  { key: 'unsolved', label: '未解决' },
];

/**
 * 首页：问题列表
 * - 排序：最新(created_at) / 热门(hot_score) / 未解决(is_solved=false)
 * - 标签筛选：tags @> '["标签"]'（JSONB contain）
 * - 搜索：标题 + 正文 ilike 模糊匹配
 * - 分页：range(from, to) + count: 'exact'
 */
export default function HomePage() {
  const [sort, setSort] = useState<SortKey>('latest');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(''); // 输入框内容
  const [keyword, setKeyword] = useState(''); // 实际生效的关键词（点击搜索后）
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [tagStats, setTagStats] = useState<TagStat[]>([]);
  const [loading, setLoading] = useState(true);

  // 标签云（RPC，访客也可调用）
  useEffect(() => {
    supabase.rpc('get_all_tags').then(({ data }) => {
      setTagStats((data as TagStat[] | null) ?? []);
    });
  }, []);

  // 查询问题列表
  const fetchList = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('qa_questions')
      .select('*, author:qa_profiles!author_id(*)', { count: 'exact' });

    // 排序
    if (sort === 'hot') {
      query = query.order('hot_score', { ascending: false });
    } else if (sort === 'unsolved') {
      query = query.eq('is_solved', false).order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // 标签筛选：tags 是 jsonb 数组，cs（contain）操作符对应 @>
    if (activeTag) {
      query = query.contains('tags', JSON.stringify([activeTag]));
    }

    // 搜索：标题 / 正文模糊匹配；去掉会破坏 PostgREST 语法的通配符与逗号
    const kw = keyword.trim().replace(/[%_,]/g, '');
    if (kw) {
      query = query.or(`title.ilike.%${kw}%,content.ilike.%${kw}%`);
    }

    // 分页
    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await query.range(from, from + PAGE_SIZE - 1);

    setList((data as Question[] | null) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [sort, activeTag, keyword, page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setKeyword(searchInput);
  };

  const handleTagClick = (tag: string) => {
    setPage(1);
    setActiveTag((prev) => (prev === tag ? null : tag)); // 再点一次取消筛选
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* 排序 Tab + 搜索框 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border bg-white p-0.5">
          {SORT_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setPage(1);
                setSort(t.key);
              }}
              className={`rounded-md px-4 py-1.5 text-sm transition ${
                sort === t.key ? 'bg-brand-600 text-white' : 'text-gray-600 hover:text-brand-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="ml-auto flex gap-2">
          <input
            className="w-52 rounded border px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="搜索标题或内容…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">
            搜索
          </button>
        </form>
      </div>

      {/* 标签筛选 */}
      {tagStats.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">标签：</span>
          {tagStats.map((t) => (
            <TagChip
              key={t.tag}
              tag={`${t.tag} (${t.question_count})`}
              active={activeTag === t.tag}
              onClick={() => handleTagClick(t.tag)}
            />
          ))}
        </div>
      )}
      {activeTag && (
        <p className="mb-3 text-sm text-gray-500">
          正在筛选标签「{activeTag}」，
          <button className="text-brand-600 hover:underline" onClick={() => setActiveTag(null)}>
            清除筛选
          </button>
        </p>
      )}

      {/* 问题列表 */}
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState text="没有找到相关问题，换个关键词或标签试试～" />
      ) : (
        <ul className="space-y-3">
          {list.map((q) => (
            <li key={q.id} className="rounded-lg border bg-white p-4 shadow-sm transition hover:shadow">
              <div className="flex items-start gap-4">
                {/* 左侧统计 */}
                <div className="flex w-16 shrink-0 flex-col items-center gap-1 text-center text-xs text-gray-500">
                  <span className="text-base font-semibold text-gray-800">{q.vote_count}</span>
                  <span>点赞</span>
                  <span className={`text-base font-semibold ${q.is_solved ? 'text-green-600' : 'text-gray-800'}`}>
                    {q.answer_count}
                  </span>
                  <span>{q.is_solved ? '已解决' : '回答'}</span>
                </div>

                {/* 右侧主体 */}
                <div className="min-w-0 flex-1">
                  <Link to={`/question/${q.id}`} className="text-base font-medium text-gray-900 hover:text-brand-600">
                    {q.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{q.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {q.tags.map((t) => (
                      <TagChip key={t} tag={t} active={activeTag === t} onClick={handleTagClick} />
                    ))}
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
                      <Link
                        to={`/profile/${q.author_id}`}
                        className="flex items-center gap-1 hover:text-brand-600"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Avatar username={q.author?.username ?? '?'} avatarUrl={q.author?.avatar_url} size="sm" />
                        {q.author?.username}
                      </Link>
                      · {new Date(q.created_at).toLocaleString()} · {q.view_count} 次浏览
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  );
}
