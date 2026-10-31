import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

/** 全站布局：导航栏 + 内容区 */
export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t py-4 text-center text-xs text-gray-400">
        问答社区 · 课程作业 · React + Supabase
      </footer>
    </div>
  );
}
