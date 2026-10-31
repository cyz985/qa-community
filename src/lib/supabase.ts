import { createClient } from '@supabase/supabase-js';

/**
 * Supabase 客户端单例
 * 密钥来自 .env（VITE_ 前缀才会被 Vite 注入到前端代码）
 * 只允许使用 anon key，service_role key 绝不能出现在前端
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // 作业场景：直接给出明确错误，避免排查困难
  throw new Error('缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，请复制 .env.example 为 .env 并填入配置');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // 会话持久化到 localStorage，刷新页面保持登录
    autoRefreshToken: true,
  },
});
