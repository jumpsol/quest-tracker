'use client';

import { useState, useEffect } from 'react';
import { supabase, Profile } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { 
  Shield, Users, Check, X, Clock, LogOut, Loader2, 
  UserCheck, UserX, RefreshCw, Target, Mail, Calendar
} from 'lucide-react';

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [updating, setUpdating] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', user.id)
        .single();

      if (!profile || profile.role !== 'admin' || profile.status !== 'approved') {
        router.push('/');
        return;
      }

      fetchUsers();
    } catch (error) {
      console.error('Admin check error:', error);
      router.push('/');
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Fetch users error:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserStatus = async (userId: string, status: 'approved' | 'rejected') => {
    setUpdating(userId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('profiles')
        .update({ 
          status,
          approved_at: status === 'approved' ? new Date().toISOString() : null,
          approved_by: status === 'approved' ? user?.id : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;
      
      // Update local state
      setUsers(users.map(u => 
        u.id === userId 
          ? { ...u, status, approved_at: status === 'approved' ? new Date().toISOString() : null }
          : u
      ));
    } catch (error) {
      console.error('Update status error:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const filteredUsers = users.filter(u => {
    if (filter === 'all') return true;
    return u.status === filter;
  });

  const stats = {
    total: users.length,
    pending: users.filter(u => u.status === 'pending').length,
    approved: users.filter(u => u.status === 'approved').length,
    rejected: users.filter(u => u.status === 'rejected').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={40} className="text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="fixed -top-52 -right-52 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(139,92,246,0.08)_0%,transparent_70%)] pointer-events-none" />
      <div className="fixed -bottom-72 -left-52 w-[700px] h-[700px] bg-[radial-gradient(circle,rgba(16,185,129,0.05)_0%,transparent_70%)] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Shield size={20} className="sm:w-[22px] sm:h-[22px] text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Admin Panel</h1>
            <p className="text-xs sm:text-sm text-gray-500">Manage user registrations</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors text-sm"
          >
            <Target size={16} className="sm:w-[18px] sm:h-[18px]" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-red-500/10 rounded-xl text-red-400 hover:bg-red-500/20 transition-colors text-sm"
          >
            <LogOut size={16} className="sm:w-[18px] sm:h-[18px]" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6 relative z-10">
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-white/5">
          <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
            <Users size={16} className="sm:w-5 sm:h-5 text-gray-400" />
            <span className="text-[10px] sm:text-sm text-gray-400">Total Users</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-900/20 to-amber-900/10 backdrop-blur-xl rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-amber-500/20">
          <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
            <Clock size={16} className="sm:w-5 sm:h-5 text-amber-500" />
            <span className="text-[10px] sm:text-sm text-amber-400">Pending</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-amber-500">{stats.pending}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-900/20 to-emerald-900/10 backdrop-blur-xl rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-emerald-500/20">
          <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
            <UserCheck size={16} className="sm:w-5 sm:h-5 text-emerald-500" />
            <span className="text-[10px] sm:text-sm text-emerald-400">Approved</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-500">{stats.approved}</p>
        </div>
        <div className="bg-gradient-to-br from-red-900/20 to-red-900/10 backdrop-blur-xl rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-red-500/20">
          <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
            <UserX size={16} className="sm:w-5 sm:h-5 text-red-500" />
            <span className="text-[10px] sm:text-sm text-red-400">Rejected</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-red-500">{stats.rejected}</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-white/5 relative z-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Users size={18} className="sm:w-5 sm:h-5 text-gray-400" />
            User Registrations
          </h2>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="flex gap-1 bg-black/30 p-1 rounded-xl overflow-x-auto flex-1 sm:flex-initial">
              {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all capitalize whitespace-nowrap flex-1 sm:flex-initial ${
                    filter === f 
                      ? 'bg-white/10 text-white' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {f} <span className="hidden sm:inline">{f !== 'all' && `(${stats[f]})`}</span>
                </button>
              ))}
            </div>
            <button
              onClick={fetchUsers}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/5 text-gray-400 flex items-center justify-center hover:text-white transition-colors flex-shrink-0"
            >
              <RefreshCw size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="text-center py-8 sm:py-12 text-gray-500">
            <Users size={40} className="sm:w-12 sm:h-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm sm:text-base">No users found</p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {filteredUsers.map(user => (
              <div
                key={user.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-5 rounded-xl sm:rounded-2xl border transition-all gap-3 sm:gap-4 ${
                  user.status === 'pending'
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : user.status === 'approved'
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center text-base sm:text-lg font-bold flex-shrink-0 ${
                    user.status === 'pending'
                      ? 'bg-amber-500/20 text-amber-500'
                      : user.status === 'approved'
                      ? 'bg-emerald-500/20 text-emerald-500'
                      : 'bg-red-500/20 text-red-500'
                  }`}>
                    {user.username?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mb-0.5 sm:mb-1">
                      <p className="font-semibold text-sm sm:text-base truncate">{user.username || 'No username'}</p>
                      {user.role === 'admin' && (
                        <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-400 text-[10px] sm:text-xs font-medium">
                          Admin
                        </span>
                      )}
                      <span className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-medium ${
                        user.status === 'pending'
                          ? 'bg-amber-500/20 text-amber-400'
                          : user.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {user.status}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-[10px] sm:text-sm text-gray-500">
                      <span className="flex items-center gap-1 truncate">
                        <Mail size={12} className="sm:w-[14px] sm:h-[14px] flex-shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={12} className="sm:w-[14px] sm:h-[14px] flex-shrink-0" />
                        {new Date(user.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {user.status === 'pending' && (
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => updateUserStatus(user.id, 'approved')}
                      disabled={updating === user.id}
                      className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-emerald-500 text-white text-xs sm:text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                    >
                      {updating === user.id ? (
                        <Loader2 size={14} className="sm:w-4 sm:h-4 animate-spin" />
                      ) : (
                        <Check size={14} className="sm:w-4 sm:h-4" />
                      )}
                      <span className="hidden sm:inline">Approve</span>
                    </button>
                    <button
                      onClick={() => updateUserStatus(user.id, 'rejected')}
                      disabled={updating === user.id}
                      className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-red-500/20 text-red-400 text-xs sm:text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                    >
                      <X size={14} className="sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Reject</span>
                    </button>
                  </div>
                )}

                {user.status === 'approved' && user.role !== 'admin' && (
                  <button
                    onClick={() => updateUserStatus(user.id, 'rejected')}
                    disabled={updating === user.id}
                    className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-red-500/10 text-red-400 text-xs sm:text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50 self-end sm:self-auto"
                  >
                    <X size={14} className="sm:w-4 sm:h-4" />
                    Revoke
                  </button>
                )}

                {user.status === 'rejected' && (
                  <button
                    onClick={() => updateUserStatus(user.id, 'approved')}
                    disabled={updating === user.id}
                    className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-emerald-500/20 text-emerald-400 text-xs sm:text-sm font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-50 self-end sm:self-auto"
                  >
                    <Check size={14} className="sm:w-4 sm:h-4" />
                    Approve
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
