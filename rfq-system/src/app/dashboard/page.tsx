'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== 'procurement') {
      router.push('/login');
      return;
    }

    setUser(parsedUser);
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Procurement Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome, {user.name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Stats */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total RFQs</p>
                <p className="text-3xl font-bold text-gray-900">0</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Suppliers</p>
                <p className="text-3xl font-bold text-gray-900">5</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Quotes</p>
                <p className="text-3xl font-bold text-gray-900">0</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/dashboard/rfqs/new"
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-center group"
            >
              <div className="text-3xl mb-2">🤖</div>
              <div className="font-semibold text-gray-900 group-hover:text-blue-600">Create RFQ with AI</div>
              <div className="text-sm text-gray-600 mt-1">Draft new request</div>
            </Link>

            <Link
              href="/dashboard/suppliers"
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-center group"
            >
              <div className="text-3xl mb-2">👥</div>
              <div className="font-semibold text-gray-900 group-hover:text-blue-600">Manage Suppliers</div>
              <div className="text-sm text-gray-600 mt-1">View and add suppliers</div>
            </Link>

            <Link
              href="/dashboard/rfqs"
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-center group"
            >
              <div className="text-3xl mb-2">📋</div>
              <div className="font-semibold text-gray-900 group-hover:text-blue-600">View RFQs</div>
              <div className="text-sm text-gray-600 mt-1">All requests</div>
            </Link>

            <Link
              href="/dashboard/orders"
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-center group"
            >
              <div className="text-3xl mb-2">📦</div>
              <div className="font-semibold text-gray-900 group-hover:text-blue-600">Purchase Orders</div>
              <div className="text-sm text-gray-600 mt-1">View POs</div>
            </Link>
          </div>
        </div>

        {/* Getting Started */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg shadow-xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">🚀 Getting Started</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-3xl mb-2">1️⃣</div>
              <h3 className="font-semibold mb-2">Upload Business Requirements</h3>
              <p className="text-blue-100 text-sm">Provide your procurement needs and relevant policy documents</p>
            </div>
            <div>
              <div className="text-3xl mb-2">2️⃣</div>
              <h3 className="font-semibold mb-2">AI Generates RFQ</h3>
              <p className="text-blue-100 text-sm">Our AI creates a complete RFQ with dynamic quote form</p>
            </div>
            <div>
              <div className="text-3xl mb-2">3️⃣</div>
              <h3 className="font-semibold mb-2">Send & Evaluate</h3>
              <p className="text-blue-100 text-sm">Distribute to suppliers, collect quotes, apply AI-powered strategies</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
