import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * 登录路由保护：
 * - 会话恢复中显示加载态，避免闪烁误跳转
 * - 未登录访问受保护页面时重定向到 /login，并记录来源路径便于登录后跳回
 */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-gray-500">加载中…</div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}
