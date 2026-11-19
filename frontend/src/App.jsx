import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Mic,
  MicOff,
  Sparkles,
  Receipt,
  Users,
  CheckCircle2,
  LogOut,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import api from './api/client';

const MEMBER_COLORS = [
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
];

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('splitsmart_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ full_name: '', email: '', password: '' });
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('scan');
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [bills, setBills] = useState([]);

  const [receipt, setReceipt] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [paidBy, setPaidBy] = useState('You');
  const [breakdowns, setBreakdowns] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (user) {
      fetchGroupsAndBills();
    }
  }, [user]);

  const fetchGroupsAndBills = async () => {
    try {
      const [grpRes, billRes] = await Promise.all([api.get('/groups/'), api.get('/bills/')]);
      setGroups(grpRes.data);
      if (grpRes.data.length > 0 && !selectedGroup) {
        setSelectedGroup(grpRes.data[0]);
      }
      setBills(billRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setAuthLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        authMode === 'login'
          ? { email: authForm.email, password: authForm.password }
          : authForm;
      const res = await api.post(endpoint, payload);
      localStorage.setItem('splitsmart_token', res.data.access_token);
      localStorage.setItem('splitsmart_user', JSON.stringify(res.data.user));
      setUser(res.data.user);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Authentication failed. Check server connection.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('splitsmart_token');
    localStorage.removeItem('splitsmart_user');
    setUser(null);
    setReceipt(null);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setLoadingMsg('AI Vision reading receipt items & taxes...');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/bills/scan-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const members = selectedGroup?.members || ['You', 'Amit', 'Priya', 'Rohan'];
      const initializedItems = res.data.items.map((item) => ({
        ...item,
        assigned_to: [...members],
      }));
      setReceipt({ ...res.data, items: initializedItems });
      await recalculateSplits(initializedItems, res.data.tax, res.data.discount, members);
      setActiveTab('split');
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to parse receipt image.');
    } finally {
      setLoadingMsg('');
    }
  };

  const toggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg('Voice input is not supported in this browser. Type your instruction instead.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInstruction(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleAISplit = async () => {
    if (!receipt || !instruction.trim()) return;
    setErrorMsg('');
    setLoadingMsg('Gemini AI understanding your split command...');
    const members = selectedGroup?.members || ['You', 'Amit', 'Priya', 'Rohan'];

    try {
      const res = await api.post('/bills/ai-split', {
        items: receipt.items,
        members,
        instruction,
        tax: receipt.tax,
        discount: receipt.discount,
        paid_by: paidBy,
      });
      setReceipt((prev) => ({
        ...prev,
        items: res.data.assigned_items,
        grand_total: res.data.grand_total,
      }));
      setBreakdowns(res.data.breakdowns);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'AI split failed.');
    } finally {
      setLoadingMsg('');
    }
  };

  const recalculateSplits = async (items, tax, discount, members) => {
    try {
      const res = await api.post('/bills/recalculate', {
        items,
        members,
        instruction: 'manual',
        tax,
        discount,
        paid_by: paidBy,
      });
      setBreakdowns(res.data.breakdowns);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleMemberOnItem = async (itemIndex, memberName) => {
    const members = selectedGroup?.members || ['You', 'Amit', 'Priya', 'Rohan'];
    const updatedItems = receipt.items.map((item, idx) => {
      if (idx !== itemIndex) return item;
      const exists = item.assigned_to.includes(memberName);
      const nextAssigned = exists
        ? item.assigned_to.filter((m) => m !== memberName)
        : [...item.assigned_to, memberName];
      return { ...item, assigned_to: nextAssigned.length > 0 ? nextAssigned : [memberName] };
    });

    setReceipt((prev) => ({ ...prev, items: updatedItems }));
    await recalculateSplits(updatedItems, receipt.tax, receipt.discount, members);
  };

  const handleSaveBill = async () => {
    if (!receipt) return;
    setLoadingMsg('Saving split bill to database...');
    const settlementsMap = {};
    breakdowns.forEach((b) => {
      if (b.member !== paidBy && b.final_owed > 0) {
        settlementsMap[b.member] = b.final_owed;
      }
    });

    try {
      await api.post('/bills/', {
        merchant_name: receipt.merchant_name,
        items: receipt.items,
        subtotal: receipt.subtotal,
        tax: receipt.tax,
        discount: receipt.discount,
        grand_total: receipt.grand_total,
        paid_by: paidBy,
        split_instruction: instruction || 'Manual tap split',
        settlements: settlementsMap,
        group_id: selectedGroup?.id || null,
      });
      await fetchGroupsAndBills();
      setActiveTab('ledger');
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Could not save bill.');
    } finally {
      setLoadingMsg('');
    }
  };

  const handleToggleSettle = async (billId) => {
    try {
      await api.patch(`/bills/${billId}/settle`);
      await fetchGroupsAndBills();
    } catch (err) {
      console.error(err);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-7">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">SplitSmart AI</h1>
              <p className="text-xs text-slate-500">OCR Receipt & Natural Language Splitter</p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl mb-5">
            <button
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
                authMode === 'login' ? 'bg-white shadow text-indigo-600' : 'text-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthMode('register')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
                authMode === 'register' ? 'bg-white shadow text-indigo-600' : 'text-slate-600'
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Aarav Sharma"
                  value={authForm.full_name}
                  onChange={(e) => setAuthForm({ ...authForm, full_name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">College / Personal Email</label>
              <input
                type="email"
                required
                placeholder="student@college.edu"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg flex items-center justify-center gap-2 transition"
            >
              {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {authMode === 'login' ? 'Sign In Securely' : 'Create Student Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const members = selectedGroup?.members || ['You', 'Amit', 'Priya', 'Rohan'];

  return (
    <div className="min-h-screen bg-slate-200 flex justify-center">
      <div className="w-full max-w-md bg-slate-50 min-h-screen shadow-2xl flex flex-col relative pb-20">
        <header className="bg-indigo-600 text-white px-5 pt-5 pb-4 rounded-b-3xl shadow-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-300" />
              <span className="font-bold text-lg tracking-tight">SplitSmart AI</span>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-2 rounded-full bg-indigo-500/50 hover:bg-indigo-500 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between bg-indigo-700/60 px-3 py-2 rounded-xl text-xs">
            <span className="flex items-center gap-1.5 text-indigo-100">
              <Users className="w-3.5 h-3.5" /> Active Group:
            </span>
            <select
              value={selectedGroup?.id || ''}
              onChange={(e) => {
                const found = groups.find((g) => g.id === Number(e.target.value));
                if (found) setSelectedGroup(found);
              }}
              className="bg-transparent font-semibold text-white focus:outline-none"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id} className="text-slate-900">
                  {g.name} ({g.members.length})
                </option>
              ))}
            </select>
          </div>
        </header>

        {loadingMsg && (
          <div className="mx-4 mt-4 p-3 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center gap-3 text-indigo-700 text-xs font-medium">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>{loadingMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mx-4 mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {errorMsg}
          </div>
        )}

        {activeTab === 'scan' && (
          <main className="p-5 space-y-5 flex-1">
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <Camera className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Scan Any Receipt</h2>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Snap a photo of a restaurant bill or hostel grocery receipt. Gemini Vision extracts items, prices, and GST automatically.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg flex items-center justify-center gap-2 transition"
              >
                <Camera className="w-4 h-4" /> Capture or Upload Receipt
              </button>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Group Members ({members.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {members.map((m, idx) => (
                  <span
                    key={m}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                      MEMBER_COLORS[idx % MEMBER_COLORS.length]
                    }`}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </main>
        )}

        {activeTab === 'split' && (
          <main className="p-4 space-y-4 flex-1">
            {!receipt ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                Scan a receipt first to start AI splitting.
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-indigo-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Tell AI Who Had What
                    </span>
                    <button
                      onClick={toggleVoiceInput}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition ${
                        isListening
                          ? 'bg-rose-600 text-white animate-pulse'
                          : 'bg-indigo-50 text-indigo-600'
                      }`}
                    >
                      {isListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                      {isListening ? 'Listening...' : 'Speak'}
                    </button>
                  </div>

                  <textarea
                    rows={2}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder='e.g., "Amit and I split the pizza, Priya had the cold coffee, everyone shared fries"'
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2.5"
                  />

                  <button
                    onClick={handleAISplit}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Auto-Assign Items with AI
                  </button>
                </div>

                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">{receipt.merchant_name}</h3>
                      <p className="text-[11px] text-slate-400">
                        Tax: ₹{receipt.tax.toFixed(2)} • Discount: ₹{receipt.discount.toFixed(2)}
                      </p>
                    </div>
                    <span className="font-bold text-base text-indigo-600">
                      ₹{receipt.grand_total.toFixed(2)}
                    </span>
                  </div>

                  {receipt.items.map((item, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex justify-between text-xs font-semibold text-slate-800 mb-2">
                        <span>{item.name}</span>
                        <span>₹{item.total_price.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {members.map((m, mIdx) => {
                          const active = item.assigned_to.includes(m);
                          return (
                            <button
                              key={m}
                              onClick={() => toggleMemberOnItem(idx, m)}
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition ${
                                active
                                  ? MEMBER_COLORS[mIdx % MEMBER_COLORS.length]
                                  : 'bg-white text-slate-400 border-slate-200'
                              }`}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Paid By:</span>
                    <select
                      value={paidBy}
                      onChange={(e) => setPaidBy(e.target.value)}
                      className="bg-slate-800 text-white text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-700"
                    >
                      {members.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 border-t border-slate-800 pt-2">
                    {breakdowns.map((b) => (
                      <div key={b.member} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold">{b.member}</span>
                          <span className="text-[10px] text-slate-400 ml-1.5">
                            (Items ₹{b.items_subtotal} + Tax ₹{b.tax_share})
                          </span>
                        </div>
                        <span className="font-bold text-emerald-400">₹{b.final_owed.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSaveBill}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    Save to Group Ledger <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </main>
        )}

        {activeTab === 'ledger' && (
          <main className="p-4 space-y-3 flex-1">
            <h2 className="text-sm font-bold text-slate-700 px-1">Saved Group Expenses</h2>
            {bills.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs">
                No saved bills yet. Scan a receipt to get started!
              </div>
            ) : (
              bills.map((bill) => (
                <div
                  key={bill.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">{bill.merchant_name}</h3>
                      <p className="text-[11px] text-slate-500">
                        Paid by <span className="font-semibold text-slate-700">{bill.paid_by}</span> • Total ₹
                        {bill.grand_total.toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleSettle(bill.id)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 ${
                        bill.is_settled
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {bill.is_settled ? 'Settled' : 'Pending'}
                    </button>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-2.5 space-y-1">
                    {Object.entries(bill.settlements || {}).map(([person, amt]) => (
                      <div key={person} className="flex justify-between text-xs">
                        <span className="text-slate-600">
                          <strong>{person}</strong> owes {bill.paid_by}
                        </span>
                        <span className="font-bold text-slate-900">₹{Number(amt).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </main>
        )}

        <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-slate-200 px-6 py-2.5 flex justify-around items-center">
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex flex-col items-center gap-1 text-[11px] font-semibold ${
              activeTab === 'scan' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <Camera className="w-5 h-5" />
            Scan Bill
          </button>
          <button
            onClick={() => setActiveTab('split')}
            className={`flex flex-col items-center gap-1 text-[11px] font-semibold ${
              activeTab === 'split' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <Receipt className="w-5 h-5" />
            AI Split
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex flex-col items-center gap-1 text-[11px] font-semibold ${
              activeTab === 'ledger' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <Wallet className="w-5 h-5" />
            Ledger
          </button>
        </nav>
      </div>
    </div>
  );
}
