import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl mx-auto p-8 text-center">
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Agentic RFQ System
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            AI-Powered Procurement Intelligence
          </p>
          <p className="text-sm text-gray-500">
            Streamline your Request for Quotation process with autonomous AI agents
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
            <div className="p-4 border rounded-lg">
              <div className="font-semibold text-blue-600 mb-2">🤖 AI RFQ Drafting</div>
              <p className="text-sm text-gray-600">Generate RFQs from requirements with policy compliance</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="font-semibold text-blue-600 mb-2">📋 Dynamic Forms</div>
              <p className="text-sm text-gray-600">Auto-generate quote submission forms</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="font-semibold text-blue-600 mb-2">🎯 Smart Filtering</div>
              <p className="text-sm text-gray-600">AI-powered supplier pre-filtering and ranking</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="font-semibold text-blue-600 mb-2">💬 Auto-fill Chat</div>
              <p className="text-sm text-gray-600">Suppliers can auto-fill forms with AI assistance</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="font-semibold text-blue-600 mb-2">📊 Quote Evaluation</div>
              <p className="text-sm text-gray-600">Apply procurement strategies in natural language</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="font-semibold text-blue-600 mb-2">📧 Automated Emails</div>
              <p className="text-sm text-gray-600">RFQ distribution, reminders, and PO sending</p>
            </div>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg"
          >
            Login as Procurement
          </Link>
          <Link
            href="/supplier/login"
            className="px-8 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors shadow-lg"
          >
            Supplier Portal
          </Link>
        </div>

        <div className="mt-8 text-sm text-gray-500">
          <p>Default Login: admin@procurement.ai / admin123</p>
        </div>
      </div>
    </div>
  );
}
