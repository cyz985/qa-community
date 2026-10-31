import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import Layout from './components/Layout';
import ProtectedRoute from './router/ProtectedRoute';

// 页面（阶段3/4 实现业务逻辑，当前为可运行的占位页）
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import AskPage from './pages/AskPage';
import QuestionDetailPage from './pages/QuestionDetailPage';
import ProfilePage from './pages/ProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import NotificationsPage from './pages/NotificationsPage';

/**
 * 路由表
 * - 公开页：首页、详情、登录、他人主页、排行榜
 * - 受保护页：提问、通知中心（ProtectedRoute 未登录自动跳转 /login）
 */
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/question/:id', element: <QuestionDetailPage /> },
      { path: '/profile/:id', element: <ProfilePage /> },
      { path: '/leaderboard', element: <LeaderboardPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/ask', element: <AskPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
