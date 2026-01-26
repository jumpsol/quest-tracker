'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  Plus, TrendingUp, TrendingDown, Calendar, DollarSign, Trash2, X,
  ChevronLeft, ChevronRight, Loader2, Check, Flame, Target, Upload, 
  Wallet, RefreshCw, ExternalLink, Shield, Zap, LogOut, Activity, Globe
} from 'lucide-react';

const questIcons: Record<string, { emoji: string; color: string }> = {
  discord: { emoji: '💬', color: '#5865F2' },
  twitter: { emoji: '𝕏', color: '#000' },
  telegram: { emoji: '✈️', color: '#0088cc' },
  youtube: { emoji: '▶️', color: '#FF0000' },
  gaming: { emoji: '🎮', color: '#9146FF' },
  fitness: { emoji: '💪', color: '#10b981' },
  learning: { emoji: '📚', color: '#f59e0b' },
  work: { emoji: '💼', color: '#6366f1' },
  crypto: { emoji: '🪙', color: '#f7931a' },
  nft: { emoji: '🖼️', color: '#ec4899' },
  savings: { emoji: '🏦', color: '#10b981' },
  custom: { emoji: '⭐', color: '#8b5cf6' }
};

const questCategories = [
  { id: 'social', label: 'Social', color: '#5865F2' },
  { id: 'defi', label: 'DeFi', color: '#f7931a' },
  { id: 'fitness', label: 'Fitness', color: '#10b981' },
  { id: 'learning', label: 'Learning', color: '#f59e0b' },
  { id: 'work', label: 'Work', color: '#6366f1' },
  { id: 'other', label: 'Other', color: '#8b5cf6' }
];

interface Quest {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  icon: string;
  category: string;
  custom_logo: string | null;
  is_savings_quest: boolean;
  savings_wallet: string | null;
  source_wallet: string | null;
  min_amount: number | null;
  token_type: 'SOL' | 'USDC' | 'BOTH' | null;
  // DeFi Quest fields
  is_defi_quest: boolean;
  defi_platform: string | null;
  defi_action: string | null;
  defi_wallets: string | null;
  defi_program_id: string | null;
}

interface QuestCompletion {
  id: string;
  quest_id: string;
  completed_date: string;
  auto_verified: boolean;
  tx_signature: string | null;
}

// ============================================
// UTC TIME UTILITIES
// ============================================

// Get today's date in UTC as YYYY-MM-DD
const getUTCDateStr = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
};

// Get time remaining until UTC midnight (00:00 UTC)
const getTimeUntilUTCReset = () => {
  const now = new Date();
  
  // Calculate next UTC midnight
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1, // Tomorrow
    0, 0, 0, 0
  ));
  
  const diffMs = nextMidnight.getTime() - now.getTime();
  const totalSeconds = Math.floor(diffMs / 1000);
  
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

// ============================================
// UTC RESET TIMER COMPONENT
// ============================================

function UTCResetTimer() {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTimeLeft(getTimeUntilUTCReset());
    
    const interval = setInterval(() => {
      setTimeLeft(getTimeUntilUTCReset());
    }, 1000); // Update every second for accuracy

    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return (
      <div className="flex gap-3">
        <div className="px-3 py-2 bg-black/30 rounded-lg animate-pulse w-16 h-12"></div>
        <div className="px-3 py-2 bg-black/30 rounded-lg animate-pulse w-16 h-12"></div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="px-3 py-2 bg-black/30 rounded-lg">
        <span className="text-2xl font-bold">{String(timeLeft.hours).padStart(2, '0')}</span>
        <span className="text-xs text-gray-500 ml-1">H</span>
      </div>
      <div className="px-3 py-2 bg-black/30 rounded-lg">
        <span className="text-2xl font-bold">{String(timeLeft.minutes).padStart(2, '0')}</span>
        <span className="text-xs text-gray-500 ml-1">M</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [completions, setCompletions] = useState<QuestCompletion[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('quests');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarFilter, setCalendarFilter] = useState<'all' | 'quests' | 'income' | 'expense'>('all');
  const [showQuestModal, setShowQuestModal] = useState(false);
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [showDefiModal, setShowDefiModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [checkingWallet, setCheckingWallet] = useState<string | null>(null);
  const [walletResults, setWalletResults] = useState<Record<string, any>>({});
  const router = useRouter();

  // DeFi Platforms with Program IDs
  const defiPlatforms = [
    { id: 'titan', name: 'Titan', programId: 'T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT', color: '#FF6B35' },
    { id: 'jupiter', name: 'Jupiter', programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', color: '#00D18C' },
    { id: 'meteora', name: 'Meteora', programId: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', color: '#E4FC82' },
    { id: 'raydium', name: 'Raydium', programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', color: '#5AC4BE' },
    { id: 'orca', name: 'Orca', programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', color: '#FFD166' },
    { id: 'custom', name: 'Custom', programId: '', color: '#8b5cf6' },
  ];

  const defiActions = [
    { id: 'swap', name: 'Swap', types: ['SWAP'] },
    { id: 'add_lp', name: 'Add Liquidity', types: ['ADD_LIQUIDITY', 'DEPOSIT'] },
    { id: 'remove_lp', name: 'Remove Liquidity', types: ['REMOVE_LIQUIDITY', 'WITHDRAW'] },
    { id: 'stake', name: 'Stake', types: ['STAKE'] },
    { id: 'any', name: 'Any Action', types: [] },
  ];

  const [newQuest, setNewQuest] = useState({ title: '', description: '', icon: 'custom', category: 'social', custom_logo: null as string | null });
  const [savingsQuest, setSavingsQuest] = useState({ title: 'Daily Savings', description: 'Transfer to savings', savings_wallet: '', source_wallet: '', min_amount: 0.01, token_type: 'SOL' as 'SOL' | 'USDC' | 'BOTH', custom_logo: null as string | null });
  const [defiQuest, setDefiQuest] = useState({ 
    title: '', description: '', custom_logo: null as string | null,
    platform: 'titan', action: 'swap', wallets: '', min_amount: 0, custom_program_id: ''
  });
  const [newTx, setNewTx] = useState({ date: new Date().toISOString().split('T')[0], amount: '', description: '', type: 'income', category: '' });

  const txCategories = {
    income: ['Freelance', 'Salary', 'Airdrop', 'Investment', 'Other'],
    expense: ['Bills', 'Food', 'Transport', 'Gas Fees', 'Other']
  };

  // Use UTC date for today
  const getTodayStr = getUTCDateStr;

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/'); return; }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!profile || profile.status !== 'approved') { router.push('/'); return; }

    setUser(user);
    setProfile(profile);
    await fetchData(user.id);
    setLoading(false);
  };

  const fetchData = async (userId: string) => {
    const [q, c, t] = await Promise.all([
      supabase.from('quests').select('*').eq('user_id', userId),
      supabase.from('quest_completions').select('*').eq('user_id', userId),
      supabase.from('transactions').select('*').eq('user_id', userId)
    ]);
    setQuests(q.data || []);
    setCompletions(c.data || []);
    setTransactions(t.data || []);
  };

  const isCompletedToday = (qid: string) => completions.some(c => c.quest_id === qid && c.completed_date === getTodayStr());

  const getStreak = (qid: string) => {
    const dates = completions.filter(c => c.quest_id === qid).map(c => c.completed_date).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());
    if (!dates.length) return 0;
    let streak = 0;
    
    // Use UTC for streak calculation
    const now = new Date();
    let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    for (let i = 0; i < 365; i++) {
      const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      if (dates.includes(ds)) { 
        streak++; 
        d.setUTCDate(d.getUTCDate()-1); 
      }
      else if (i > 0) break;
      else d.setUTCDate(d.getUTCDate()-1);
    }
    return streak;
  };

  const toggleComplete = async (qid: string) => {
    const quest = quests.find(q => q.id === qid);
    if (quest?.is_savings_quest) { checkWallet(quest); return; }
    if (quest?.is_defi_quest) { checkDefiQuest(quest); return; }

    const today = getTodayStr();
    const existing = completions.find(c => c.quest_id === qid && c.completed_date === today);

    if (existing) {
      await supabase.from('quest_completions').delete().eq('id', existing.id);
      setCompletions(completions.filter(c => c.id !== existing.id));
    } else {
      const { data } = await supabase.from('quest_completions').insert({ user_id: user.id, quest_id: qid, completed_date: today }).select().single();
      if (data) setCompletions([...completions, data]);
    }
  };

  const checkWallet = async (quest: Quest) => {
    if (!quest.savings_wallet) return;
    setCheckingWallet(quest.id);
    try {
      const res = await fetch('/api/check-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          savingsWallet: quest.savings_wallet, 
          sourceWallet: quest.source_wallet, 
          minAmount: quest.min_amount,
          tokenType: quest.token_type || 'SOL'
        })
      });
      const result = await res.json();
      setWalletResults(p => ({ ...p, [quest.id]: result }));

      if (result.isCompleted && !isCompletedToday(quest.id)) {
        const { data } = await supabase.from('quest_completions').insert({
          user_id: user.id, quest_id: quest.id, completed_date: getTodayStr(),
          auto_verified: true, tx_signature: result.transactions?.[0]?.signature
        }).select().single();
        if (data) setCompletions([...completions, data]);
      }
    } catch (e) { console.error(e); }
    setCheckingWallet(null);
  };

  // ============================================
  // FIXED: checkDefiQuest function
  // ============================================
  const checkDefiQuest = async (quest: Quest) => {
    if (!quest.defi_wallets) return;
    setCheckingWallet(quest.id);
    try {
      // Get the first wallet from comma-separated list
      const walletList = quest.defi_wallets.split(',').map(w => w.trim());
      const walletAddress = walletList[0];
      
      const res = await fetch('/api/check-defi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          walletAddress: walletAddress,
          protocol: quest.defi_platform || 'jupiter',
        })
      });
      const result = await res.json();
      setWalletResults(p => ({ ...p, [quest.id]: result }));

      // API returns 'found' not 'isCompleted'
      if (result.found && !isCompletedToday(quest.id)) {
        const { data } = await supabase.from('quest_completions').insert({
          user_id: user.id, quest_id: quest.id, completed_date: getTodayStr(),
          auto_verified: true, tx_signature: result.transactions?.[0]?.signature || result.latestSignature
        }).select().single();
        if (data) setCompletions([...completions, data]);
      }
    } catch (e) { console.error(e); }
    setCheckingWallet(null);
  };

  const addQuest = async () => {
    if (!newQuest.title) return;
    const { data } = await supabase.from('quests').insert({
      user_id: user.id, title: newQuest.title, description: newQuest.description,
      icon: newQuest.icon, category: newQuest.category, custom_logo: newQuest.custom_logo, 
      is_savings_quest: false, is_defi_quest: false
    }).select().single();
    if (data) setQuests([...quests, data]);
    setNewQuest({ title: '', description: '', icon: 'custom', category: 'social', custom_logo: null });
    setShowQuestModal(false);
  };

  const addSavingsQuest = async () => {
    if (!savingsQuest.savings_wallet) return;
    const { data } = await supabase.from('quests').insert({
      user_id: user.id, title: savingsQuest.title, description: savingsQuest.description,
      icon: 'savings', category: 'savings', is_savings_quest: true, is_defi_quest: false,
      savings_wallet: savingsQuest.savings_wallet, source_wallet: savingsQuest.source_wallet || null, 
      min_amount: savingsQuest.min_amount, token_type: savingsQuest.token_type,
      custom_logo: savingsQuest.custom_logo
    }).select().single();
    if (data) setQuests([...quests, data]);
    setSavingsQuest({ title: 'Daily Savings', description: 'Transfer to savings', savings_wallet: '', source_wallet: '', min_amount: 0.01, token_type: 'SOL', custom_logo: null });
    setShowSavingsModal(false);
  };

  const addDefiQuest = async () => {
    if (!defiQuest.wallets || !defiQuest.title) return;
    const platform = defiPlatforms.find(p => p.id === defiQuest.platform);
    const programId = defiQuest.platform === 'custom' ? defiQuest.custom_program_id : platform?.programId;
    
    const { data } = await supabase.from('quests').insert({
      user_id: user.id, title: defiQuest.title, description: defiQuest.description,
      icon: 'crypto', category: 'defi', is_savings_quest: false, is_defi_quest: true,
      custom_logo: defiQuest.custom_logo,
      defi_platform: defiQuest.platform,
      defi_action: defiQuest.action,
      defi_wallets: defiQuest.wallets,
      defi_program_id: programId,
      min_amount: defiQuest.min_amount || null
    }).select().single();
    if (data) setQuests([...quests, data]);
    setDefiQuest({ title: '', description: '', custom_logo: null, platform: 'titan', action: 'swap', wallets: '', min_amount: 0, custom_program_id: '' });
    setShowDefiModal(false);
  };

  const deleteQuest = async (id: string) => {
    await supabase.from('quests').delete().eq('id', id);
    setQuests(quests.filter(q => q.id !== id));
  };

  const addTransaction = async () => {
    if (!newTx.amount) return;
    const { data } = await supabase.from('transactions').insert({ user_id: user.id, ...newTx, amount: parseFloat(newTx.amount) }).select().single();
    if (data) setTransactions([...transactions, data]);
    setNewTx({ date: new Date().toISOString().split('T')[0], amount: '', description: '', type: 'income', category: '' });
    setShowTxModal(false);
  };

  const deleteTx = async (id: string) => {
    await supabase.from('transactions').delete().eq('id', id);
    setTransactions(transactions.filter(t => t.id !== id));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewQuest(p => ({ ...p, custom_logo: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const getIcon = (q: Quest, size = 52) => {
    if (q.custom_logo) return <img src={q.custom_logo} alt="" style={{ width: size, height: size, borderRadius: 14, objectFit: 'cover' }} />;
    const i = questIcons[q.icon] || questIcons.custom;
    return <div style={{ width: size, height: size, borderRadius: 14, background: `${i.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{i.emoji}</div>;
  };

  const stats = useMemo(() => ({ done: quests.filter(q => isCompletedToday(q.id)).length, total: quests.length }), [quests, completions]);
  
  const txStats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [transactions]);

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const formatCurrency = (n: number) => '$' + n.toFixed(2);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 size={40} className="text-emerald-500 animate-spin" /></div>;

  return (
    <div className="min-h-screen p-6 relative">
      <div className="fixed -top-52 -right-52 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(16,185,129,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* Header */}
      <div className="flex justify-between items-center mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Target size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Quest Tracker</h1>
            <p className="text-sm text-gray-500">Welcome, {profile?.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {profile?.role === 'admin' && (
            <button onClick={() => router.push('/admin')} className="flex items-center gap-2 px-4 py-2.5 bg-violet-500/10 rounded-xl text-violet-400">
              <Shield size={18} /> Admin
            </button>
          )}
          {activeTab === 'quests' && (
            <button onClick={() => setShowSavingsModal(true)} className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl text-white text-sm font-semibold shadow-lg shadow-emerald-500/30">
              <Wallet size={18} /> Savings
            </button>
          )}
          {activeTab === 'quests' && (
            <button onClick={() => setShowDefiModal(true)} className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl text-white text-sm font-semibold shadow-lg shadow-orange-500/30">
              <Activity size={18} /> DeFi Quest
            </button>
          )}
          <button onClick={() => activeTab === 'quests' ? setShowQuestModal(true) : setShowTxModal(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-violet-500 to-violet-600 rounded-xl text-white text-sm font-semibold shadow-lg shadow-violet-500/30">
            <Plus size={18} /> {activeTab === 'quests' ? 'Add Quest' : 'Add Transaction'}
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/'); }} className="p-2.5 bg-red-500/10 rounded-xl text-red-400">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-black/30 p-1.5 rounded-2xl w-fit relative z-10">
        {[{ id: 'quests', label: 'Quests', icon: Target }, { id: 'calendar', label: 'Calendar', icon: Calendar }, { id: 'income', label: 'Income', icon: DollarSign }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium ${activeTab === t.id ? 'bg-white/10 text-white' : 'text-gray-500'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* QUESTS */}
      {activeTab === 'quests' && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-white/5">
              <p className="text-sm text-gray-400 mb-2">Progress</p>
              <p className="text-4xl font-bold text-emerald-500 mb-2">{stats.done}/{stats.total}</p>
              <div className="h-1.5 bg-white/10 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.total ? (stats.done/stats.total)*100 : 0}%` }} /></div>
            </div>
            
            {/* UTC RESET TIMER - UPDATED */}
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm text-gray-400">Resets in</p>
                <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 rounded-full">
                  <Globe size={12} className="text-blue-400" />
                  <span className="text-xs text-blue-400 font-medium">UTC</span>
                </div>
              </div>
              <UTCResetTimer />
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-3xl p-7 border border-white/5 relative z-10">
            <h2 className="text-lg font-semibold mb-5 flex items-center gap-2"><Target size={20} className="text-gray-400" /> Daily Quests</h2>
            <div className="space-y-3">
              {quests.map(q => {
                const done = isCompletedToday(q.id);
                const streak = getStreak(q.id);
                const checking = checkingWallet === q.id;
                const result = walletResults[q.id];
                
                return (
                  <div key={q.id} className={`flex items-center justify-between p-5 rounded-2xl border ${done ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-black/25 border-white/5'}`}>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {getIcon(q, 52)}
                        {done && <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-gray-900"><Check size={12} className="text-white" /></div>}
                        {q.is_savings_quest && !done && <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center border-2 border-gray-900"><Zap size={10} className="text-white" /></div>}
                        {q.is_defi_quest && !done && <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center border-2 border-gray-900"><Activity size={10} className="text-white" /></div>}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`font-semibold ${done ? 'text-emerald-500' : ''}`}>{q.title}</p>
                          {q.is_savings_quest && (
                            <span className="px-2 py-0.5 rounded text-xs" style={{
                              background: q.token_type === 'USDC' ? '#2775CA22' : q.token_type === 'BOTH' ? '#10b98122' : '#9945FF22',
                              color: q.token_type === 'USDC' ? '#2775CA' : q.token_type === 'BOTH' ? '#10b981' : '#9945FF'
                            }}>
                              {q.token_type === 'USDC' ? '$ USDC' : q.token_type === 'BOTH' ? '◎ + $' : '◎ SOL'}
                            </span>
                          )}
                          {q.is_defi_quest && q.defi_platform && (
                            <span className="px-2 py-0.5 rounded text-xs" style={{
                              background: `${defiPlatforms.find(p => p.id === q.defi_platform)?.color || '#8b5cf6'}22`,
                              color: defiPlatforms.find(p => p.id === q.defi_platform)?.color || '#8b5cf6'
                            }}>
                              {defiPlatforms.find(p => p.id === q.defi_platform)?.name || q.defi_platform}
                            </span>
                          )}
                          {(q.is_savings_quest || q.is_defi_quest) && <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs">Auto</span>}
                          {streak >= 3 && <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 text-xs flex items-center gap-1"><Flame size={12} />{streak}d</span>}
                        </div>
                        <p className="text-sm text-gray-500">{q.description}</p>
                        {q.is_savings_quest && result?.todayStats && (
                          <div className="mt-2 text-xs text-gray-500">
                            Today: 
                            {(q.token_type === 'SOL' || q.token_type === 'BOTH' || !q.token_type) && parseFloat(result.todayStats.totalSOL) > 0 && (
                              <span className="text-purple-400 ml-1">{result.todayStats.totalSOL} SOL</span>
                            )}
                            {(q.token_type === 'USDC' || q.token_type === 'BOTH') && parseFloat(result.todayStats.totalUSDC) > 0 && (
                              <span className="text-blue-400 ml-1">${result.todayStats.totalUSDC} USDC</span>
                            )}
                            {parseFloat(result.todayStats.totalSOL) === 0 && parseFloat(result.todayStats.totalUSDC) === 0 && (
                              <span className="ml-1">No transfers yet</span>
                            )}
                            {result.transactions?.[0] && <a href={`https://solscan.io/tx/${result.transactions[0].signature}`} target="_blank" className="ml-3 text-blue-400">View TX <ExternalLink size={10} className="inline" /></a>}
                          </div>
                        )}
                        {q.is_defi_quest && result && (
                          <div className="mt-2 text-xs text-gray-500">
                            Today: <span className={result.transactionCount > 0 ? 'text-emerald-400' : ''}>{result.transactionCount || 0} transactions</span>
                            {result.transactions?.[0] && <a href={`https://solscan.io/tx/${result.transactions[0].signature}`} target="_blank" className="ml-3 text-blue-400">View TX <ExternalLink size={10} className="inline" /></a>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {(q.is_savings_quest || q.is_defi_quest) ? (
                        <button onClick={() => q.is_defi_quest ? checkDefiQuest(q) : checkWallet(q)} disabled={checking} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${done ? 'bg-emerald-500 text-white' : q.is_defi_quest ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {checking ? <Loader2 size={16} className="animate-spin" /> : done ? <Check size={16} /> : <RefreshCw size={16} />}
                          {checking ? '...' : done ? 'Verified' : 'Verify'}
                        </button>
                      ) : (
                        <button onClick={() => toggleComplete(q.id)} className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-white/15 text-gray-500'}`}>
                          <Check size={20} />
                        </button>
                      )}
                      <button onClick={() => deleteQuest(q.id)} className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
              {!quests.length && <div className="text-center py-12 text-gray-500"><Target size={48} className="mx-auto mb-4 opacity-50" /><p>No quests yet</p></div>}
            </div>
          </div>
        </>
      )}

      {/* CALENDAR */}
      {activeTab === 'calendar' && (
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-3xl p-7 border border-white/5 relative z-10">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold">{monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</h2>
              <button onClick={() => setCalendarMonth(new Date())} className="px-4 py-2 rounded-full bg-white/5 text-gray-400 text-sm">Today</button>
              <div className="flex gap-2">
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()-1))} className="w-9 h-9 rounded-lg bg-black/30 text-gray-400 flex items-center justify-center"><ChevronLeft size={20} /></button>
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()+1))} className="w-9 h-9 rounded-lg bg-black/30 text-gray-400 flex items-center justify-center"><ChevronRight size={20} /></button>
              </div>
            </div>
            {/* Filter Buttons */}
            <div className="flex gap-1 bg-black/30 p-1 rounded-xl">
              {[
                { id: 'all', label: 'All', color: 'white' },
                { id: 'quests', label: 'Quests', color: '#8b5cf6' },
                { id: 'income', label: 'Income', color: '#10b981' },
                { id: 'expense', label: 'Expense', color: '#ef4444' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setCalendarFilter(f.id as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${calendarFilter === f.id ? 'bg-white/10' : ''}`}
                  style={{ color: calendarFilter === f.id ? f.color : '#6b7280' }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 mb-3">
            {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => <div key={d} className="text-center text-xs text-gray-500 py-3">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {(() => {
              const y = calendarMonth.getFullYear(), m = calendarMonth.getMonth();
              const first = new Date(y, m, 1), last = new Date(y, m+1, 0);
              let start = first.getDay() - 1; if (start < 0) start = 6;
              const days: any[] = [];
              const prev = new Date(y, m, 0);
              for (let i = start-1; i >= 0; i--) days.push({ d: prev.getDate()-i, cur: false });
              for (let i = 1; i <= last.getDate(); i++) days.push({ d: i, cur: true, date: `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}` });
              while (days.length < 42) days.push({ d: days.length - last.getDate() - start + 1, cur: false });
              
              const today = getTodayStr();
              return days.map((day, i) => {
                const isToday = day.date === today;
                
                // Quests completed on this day
                const completedQuests = day.date ? quests.filter(q => completions.some(c => c.quest_id === q.id && c.completed_date === day.date)) : [];
                
                // Transactions on this day
                const dayIncome = day.date ? transactions.filter(t => t.date === day.date && t.type === 'income') : [];
                const dayExpense = day.date ? transactions.filter(t => t.date === day.date && t.type === 'expense') : [];
                const totalIncome = dayIncome.reduce((s, t) => s + t.amount, 0);
                const totalExpense = dayExpense.reduce((s, t) => s + t.amount, 0);
                
                // Determine what to show based on filter
                const showQuests = calendarFilter === 'all' || calendarFilter === 'quests';
                const showIncome = calendarFilter === 'all' || calendarFilter === 'income';
                const showExpense = calendarFilter === 'all' || calendarFilter === 'expense';
                
                // Dot color logic
                let dot = '';
                if (calendarFilter === 'all') {
                  if (completedQuests.length && (dayIncome.length || dayExpense.length)) dot = 'bg-white';
                  else if (completedQuests.length) dot = 'bg-violet-500';
                  else if (dayIncome.length) dot = 'bg-emerald-500';
                  else if (dayExpense.length) dot = 'bg-red-500';
                } else if (calendarFilter === 'quests' && completedQuests.length) {
                  const rate = quests.length ? completedQuests.length / quests.length : 0;
                  dot = rate === 1 ? 'bg-emerald-500' : rate >= 0.5 ? 'bg-amber-500' : 'bg-violet-500';
                } else if (calendarFilter === 'income' && dayIncome.length) {
                  dot = 'bg-emerald-500';
                } else if (calendarFilter === 'expense' && dayExpense.length) {
                  dot = 'bg-red-500';
                }

                return (
                  <div key={i} className={`aspect-square rounded-2xl p-2 flex flex-col relative ${isToday ? 'bg-orange-500/20 border-2 border-orange-500/60' : day.cur ? 'bg-black/25 border border-white/5' : 'bg-black/10 opacity-30'}`}>
                    {dot && <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${dot}`} />}
                    <span className={`font-medium text-sm ${isToday ? 'text-orange-500' : ''}`}>{day.d}</span>
                    
                    <div className="mt-auto space-y-1">
                      {/* Show quests */}
                      {showQuests && completedQuests.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 justify-center">
                          {completedQuests.slice(0, 3).map(q => <div key={q.id} className="w-5 h-5">{getIcon(q, 20)}</div>)}
                          {completedQuests.length > 3 && <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[8px] text-gray-400">+{completedQuests.length - 3}</div>}
                        </div>
                      )}
                      
                      {/* Show income */}
                      {showIncome && totalIncome > 0 && (
                        <div className="text-[10px] text-emerald-400 text-center font-medium truncate">
                          +${totalIncome.toFixed(0)}
                        </div>
                      )}
                      
                      {/* Show expense */}
                      {showExpense && totalExpense > 0 && (
                        <div className="text-[10px] text-red-400 text-center font-medium truncate">
                          -${totalExpense.toFixed(0)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          
          {/* Legend */}
          <div className="flex justify-between items-center mt-6 pt-5 border-t border-white/5">
            <div className="flex gap-6">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-violet-500" /><span className="text-xs text-gray-500">Quests</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-xs text-gray-500">Income</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-xs text-gray-500">Expense</span></div>
            </div>
            <div className="text-sm text-gray-400">
              <span className="font-semibold text-white">{quests.length}</span> Quests • <span className="font-semibold text-emerald-500">{transactions.filter(t => t.type === 'income').length}</span> Income • <span className="font-semibold text-red-500">{transactions.filter(t => t.type === 'expense').length}</span> Expense
            </div>
          </div>
        </div>
      )}

      {/* INCOME */}
      {activeTab === 'income' && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6 relative z-10">
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-white/5">
              <p className="text-sm text-gray-400 mb-2">Net Balance</p>
              <p className={`text-4xl font-bold ${txStats.net >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatCurrency(txStats.net)}</p>
            </div>
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-white/5">
              <p className="text-sm text-gray-400 mb-2">Income</p>
              <p className="text-4xl font-bold text-emerald-500">+{formatCurrency(txStats.income)}</p>
            </div>
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl p-6 border border-white/5">
              <p className="text-sm text-gray-400 mb-2">Expenses</p>
              <p className="text-4xl font-bold text-red-500">-{formatCurrency(txStats.expense)}</p>
            </div>
          </div>
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-3xl p-7 border border-white/5 relative z-10">
            <h2 className="text-lg font-semibold mb-5">Transactions</h2>
            <div className="space-y-3">
              {transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0,10).map(t => (
                <div key={t.id} className="flex items-center justify-between p-4 bg-black/25 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                      {t.type === 'income' ? <TrendingUp size={20} className="text-emerald-500" /> : <TrendingDown size={20} className="text-red-500" />}
                    </div>
                    <div><p className="font-semibold">{t.description || 'Transaction'}</p><p className="text-xs text-gray-500">{t.category} • {t.date}</p></div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>{t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}</span>
                    <button onClick={() => deleteTx(t.id)} className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {!transactions.length && <div className="text-center py-12 text-gray-500"><DollarSign size={48} className="mx-auto mb-4 opacity-50" /><p>No transactions</p></div>}
            </div>
          </div>
        </>
      )}

      {/* Quest Modal */}
      {showQuestModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-8 w-full max-w-lg border border-white/10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Add Quest</h3>
              <button onClick={() => setShowQuestModal(false)} className="w-9 h-9 rounded-xl bg-white/5 text-gray-400 flex items-center justify-center"><X size={20} /></button>
            </div>
            <div className="space-y-5">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-black/30 border-2 border-dashed border-white/15 flex items-center justify-center overflow-hidden">
                    {newQuest.custom_logo ? <img src={newQuest.custom_logo} className="w-full h-full object-cover" /> : <Plus size={24} className="text-gray-600" />}
                  </div>
                  <div>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="logo" />
                    <label htmlFor="logo" className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold cursor-pointer"><Upload size={16} className="inline mr-2" />Upload</label>
                    {newQuest.custom_logo && <button onClick={() => setNewQuest(p => ({...p, custom_logo: null}))} className="ml-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-500 text-sm">Remove</button>}
                  </div>
                </div>
              </div>
              {!newQuest.custom_logo && (
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Or icon</label>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(questIcons).filter(([k]) => k !== 'savings').map(([k, {emoji, color}]) => (
                      <button key={k} onClick={() => setNewQuest(p => ({...p, icon: k}))} className="w-10 h-10 rounded-xl text-lg flex items-center justify-center border-2" style={newQuest.icon === k ? {borderColor: color, background: `${color}22`} : {borderColor: 'rgba(255,255,255,0.1)'}}>{emoji}</button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Title</label>
                <input value={newQuest.title} onChange={e => setNewQuest(p => ({...p, title: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white" placeholder="Quest title" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Description</label>
                <input value={newQuest.description} onChange={e => setNewQuest(p => ({...p, description: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white" placeholder="What to do?" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Category</label>
                <div className="flex gap-2 flex-wrap">
                  {questCategories.map(c => (
                    <button key={c.id} onClick={() => setNewQuest(p => ({...p, category: c.id}))} className="px-4 py-2 rounded-xl text-sm border-2" style={newQuest.category === c.id ? {borderColor: c.color, color: c.color, background: `${c.color}22`} : {borderColor: 'rgba(255,255,255,0.1)', color: '#6b7280'}}>{c.label}</button>
                  ))}
                </div>
              </div>
              <button onClick={addQuest} className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl text-white font-semibold">Add Quest</button>
            </div>
          </div>
        </div>
      )}

      {/* Savings Modal */}
      {showSavingsModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-8 w-full max-w-lg border border-white/10 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center"><Wallet size={20} className="text-emerald-500" /></div>
                <h3 className="text-xl font-semibold">Savings Quest</h3>
              </div>
              <button onClick={() => setShowSavingsModal(false)} className="w-9 h-9 rounded-xl bg-white/5 text-gray-400 flex items-center justify-center"><X size={20} /></button>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <Zap size={20} className="text-blue-400" />
                <div><p className="text-sm font-medium text-blue-400">Auto-verification</p><p className="text-xs text-gray-400 mt-1">Verifies automatically when you transfer tokens</p></div>
              </div>
            </div>
            <div className="space-y-5">
              {/* Logo Upload */}
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Quest Logo (optional)</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-black/30 border-2 border-dashed border-white/15 flex items-center justify-center overflow-hidden">
                    {savingsQuest.custom_logo ? (
                      <img src={savingsQuest.custom_logo} className="w-full h-full object-cover" />
                    ) : (
                      <Wallet size={24} className="text-gray-600" />
                    )}
                  </div>
                  <div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setSavingsQuest(p => ({...p, custom_logo: reader.result as string}));
                          reader.readAsDataURL(file);
                        }
                      }} 
                      className="hidden" 
                      id="savings-logo" 
                    />
                    <label htmlFor="savings-logo" className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold cursor-pointer inline-flex items-center gap-2">
                      <Upload size={16} />Upload
                    </label>
                    {savingsQuest.custom_logo && (
                      <button onClick={() => setSavingsQuest(p => ({...p, custom_logo: null}))} className="ml-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-500 text-sm">Remove</button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Title</label>
                <input value={savingsQuest.title} onChange={e => setSavingsQuest(p => ({...p, title: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Token Type</label>
                <div className="flex gap-2">
                  {[
                    { id: 'SOL', label: '◎ SOL', color: '#9945FF' },
                    { id: 'USDC', label: '$ USDC', color: '#2775CA' },
                    { id: 'BOTH', label: '◎ + $ Both', color: '#10b981' }
                  ].map(t => (
                    <button 
                      key={t.id} 
                      onClick={() => setSavingsQuest(p => ({...p, token_type: t.id as any}))}
                      className="flex-1 py-3 rounded-xl font-semibold border-2 transition-all"
                      style={savingsQuest.token_type === t.id 
                        ? { borderColor: t.color, color: t.color, background: `${t.color}22` } 
                        : { borderColor: 'rgba(255,255,255,0.1)', color: '#6b7280' }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Savings Wallet *</label>
                <input value={savingsQuest.savings_wallet} onChange={e => setSavingsQuest(p => ({...p, savings_wallet: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white font-mono text-sm" placeholder="Wallet address" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Source Wallet (optional)</label>
                <input value={savingsQuest.source_wallet} onChange={e => setSavingsQuest(p => ({...p, source_wallet: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white font-mono text-sm" placeholder="Your main wallet" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  Min Amount ({savingsQuest.token_type === 'USDC' ? 'USDC' : savingsQuest.token_type === 'BOTH' ? 'SOL or USDC' : 'SOL'})
                </label>
                <input type="number" step="0.001" value={savingsQuest.min_amount} onChange={e => setSavingsQuest(p => ({...p, min_amount: parseFloat(e.target.value) || 0}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white" />
              </div>
              <button onClick={addSavingsQuest} disabled={!savingsQuest.savings_wallet} className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl text-white font-semibold disabled:opacity-50">Add Savings Quest</button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showTxModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-8 w-full max-w-md border border-white/10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Add Transaction</h3>
              <button onClick={() => setShowTxModal(false)} className="w-9 h-9 rounded-xl bg-white/5 text-gray-400 flex items-center justify-center"><X size={20} /></button>
            </div>
            <div className="flex gap-3 mb-6">
              {(['income', 'expense'] as const).map(t => (
                <button key={t} onClick={() => setNewTx(p => ({...p, type: t, category: ''}))} className={`flex-1 py-3 rounded-xl font-semibold border-2 ${newTx.type === t ? (t === 'income' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-red-500 bg-red-500/10 text-red-500') : 'border-white/10 text-gray-500'}`}>
                  {t === 'income' ? '💰 Income' : '💸 Expense'}
                </button>
              ))}
            </div>
            <div className="space-y-5">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Amount</label>
                <input type="number" value={newTx.amount} onChange={e => setNewTx(p => ({...p, amount: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white" placeholder="0.00" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Description</label>
                <input value={newTx.description} onChange={e => setNewTx(p => ({...p, description: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white" placeholder="Description" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Category</label>
                <select value={newTx.category} onChange={e => setNewTx(p => ({...p, category: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white">
                  <option value="">Select</option>
                  {txCategories[newTx.type as 'income' | 'expense'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Date</label>
                <input type="date" value={newTx.date} onChange={e => setNewTx(p => ({...p, date: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white" />
              </div>
              <button onClick={addTransaction} className={`w-full py-4 rounded-xl text-white font-semibold ${newTx.type === 'income' ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' : 'bg-gradient-to-r from-orange-500 to-orange-600'}`}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* DeFi Quest Modal */}
      {showDefiModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-8 w-full max-w-lg border border-white/10 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center"><Activity size={20} className="text-orange-500" /></div>
                <h3 className="text-xl font-semibold">DeFi Quest</h3>
              </div>
              <button onClick={() => setShowDefiModal(false)} className="w-9 h-9 rounded-xl bg-white/5 text-gray-400 flex items-center justify-center"><X size={20} /></button>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <Zap size={20} className="text-orange-400" />
                <div><p className="text-sm font-medium text-orange-400">On-chain Verification</p><p className="text-xs text-gray-400 mt-1">Automatically verifies your DeFi transactions</p></div>
              </div>
            </div>
            <div className="space-y-5">
              {/* Logo Upload */}
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Quest Logo (optional)</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-black/30 border-2 border-dashed border-white/15 flex items-center justify-center overflow-hidden">
                    {defiQuest.custom_logo ? (
                      <img src={defiQuest.custom_logo} className="w-full h-full object-cover" />
                    ) : (
                      <Activity size={24} className="text-gray-600" />
                    )}
                  </div>
                  <div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setDefiQuest(p => ({...p, custom_logo: reader.result as string}));
                          reader.readAsDataURL(file);
                        }
                      }} 
                      className="hidden" 
                      id="defi-logo" 
                    />
                    <label htmlFor="defi-logo" className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold cursor-pointer inline-flex items-center gap-2">
                      <Upload size={16} />Upload
                    </label>
                    {defiQuest.custom_logo && (
                      <button onClick={() => setDefiQuest(p => ({...p, custom_logo: null}))} className="ml-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-500 text-sm">Remove</button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Title *</label>
                <input value={defiQuest.title} onChange={e => setDefiQuest(p => ({...p, title: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white" placeholder="Daily Titan Swap" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Description</label>
                <input value={defiQuest.description} onChange={e => setDefiQuest(p => ({...p, description: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white" placeholder="Swap on Titan Exchange" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Platform</label>
                <div className="grid grid-cols-3 gap-2">
                  {defiPlatforms.map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => setDefiQuest(prev => ({...prev, platform: p.id}))}
                      className="py-3 rounded-xl font-semibold border-2 transition-all text-sm"
                      style={defiQuest.platform === p.id 
                        ? { borderColor: p.color, color: p.color, background: `${p.color}22` } 
                        : { borderColor: 'rgba(255,255,255,0.1)', color: '#6b7280' }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              {defiQuest.platform === 'custom' && (
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Custom Program ID *</label>
                  <input value={defiQuest.custom_program_id} onChange={e => setDefiQuest(p => ({...p, custom_program_id: e.target.value}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white font-mono text-sm" placeholder="Program ID" />
                </div>
              )}
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Action Type</label>
                <div className="flex gap-2 flex-wrap">
                  {defiActions.map(a => (
                    <button 
                      key={a.id} 
                      onClick={() => setDefiQuest(prev => ({...prev, action: a.id}))}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${defiQuest.action === a.id ? 'border-orange-500 bg-orange-500/20 text-orange-400' : 'border-white/10 text-gray-500'}`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Wallet Addresses * <span className="text-gray-500">(comma separated for multiple)</span></label>
                <textarea 
                  value={defiQuest.wallets} 
                  onChange={e => setDefiQuest(p => ({...p, wallets: e.target.value}))} 
                  className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white font-mono text-sm h-20 resize-none" 
                  placeholder="wallet1, wallet2, wallet3..."
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Min Volume (USD, optional)</label>
                <input type="number" step="1" value={defiQuest.min_amount || ''} onChange={e => setDefiQuest(p => ({...p, min_amount: parseFloat(e.target.value) || 0}))} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white" placeholder="0" />
              </div>
              <button onClick={addDefiQuest} disabled={!defiQuest.wallets || !defiQuest.title} className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl text-white font-semibold disabled:opacity-50">Add DeFi Quest</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
