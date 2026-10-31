import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * 登录 / 注册页
 * - 注册：supabase.auth.signUp，用户名通过 options.data.username 传入，
 *         数据库触发器会自动创建 profiles 记录
 * - 登录：supabase.auth.signInWithPassword
 * - 成功后跳回来源页面（ProtectedRoute 通过 state.from 传递），默认回首页
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // ProtectedRoute 跳转过来时会带上原始目标地址
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [tip, setTip] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setTip('');

    // 基础前端校验（数据库层仍有约束兜底）
    if (password.length < 6) {
      setError('密码长度至少 6 位');
      return;
    }
    if (mode === 'register' && (username.length < 2 || username.length > 30)) {
      setError('用户名长度需在 2-30 个字符之间');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } }, // 触发器读取该字段创建 profile
        });
        if (error) throw error;
        // 若项目开启了邮箱确认，需要先到邮箱点击链接；关闭则可直接登录
        setTip('注册成功！如开启了邮箱验证请先查收邮件，否则可直接登录。');
        setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="mb-6 text-center text-2xl font-bold">
        {mode === 'login' ? '登录' : '注册'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        {mode === 'register' && (
          <div>
            <label className="mb-1 block text-sm text-gray-600">用户名</label>
            <input
              className="w-full rounded border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="2-30 个字符"
              required
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm text-gray-600">邮箱</label>
          <input
            type="email"
            className="w-full rounded border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">密码</label>
          <input
            type="password"
            className="w-full rounded border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
            required
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {tip && <p className="text-sm text-green-600">{tip}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-brand-600 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? '处理中…' : mode === 'login' ? '登录' : '注册'}
        </button>

        <p className="text-center text-sm text-gray-500">
          {mode === 'login' ? '还没有账号？' : '已有账号？'}
          <button
            type="button"
            className="text-brand-600 hover:underline"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
              setTip('');
            }}
          >
            {mode === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
        <p className="text-center text-sm">
          <Link to="/" className="text-gray-400 hover:text-brand-600">← 返回首页</Link>
        </p>
      </form>
    </div>
  );
}
