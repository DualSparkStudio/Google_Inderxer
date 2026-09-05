'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuth, logout as callLogout } from '@/lib/auth';
import { api } from '@/lib/api';

const NAV = [
  { href: '/submit-url', label: 'Submit URL', icon: '＋' },
  { href: '/history',    label: 'History',    icon: '⏱' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try { await api.logout(); } catch { /* ignore */ }
    clearAuth();
    router.push('/login');
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-200 bg-white px-4 py-6">
      {/* Brand */}
      <div className="mb-8">
        <span className="text-lg font-semibold text-gray-900 tracking-tight">
          URL Indexer
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
      >
        <span className="text-base leading-none">→</span>
        Logout
      </button>
    </aside>
  );
}
