import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
export interface Profile {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface Quest {
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
  created_at: string;
}

export interface QuestCompletion {
  id: string;
  user_id: string;
  quest_id: string;
  completed_date: string;
  auto_verified: boolean;
  tx_signature: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string | null;
  category: string | null;
  date: string;
  created_at: string;
}
