import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export const useAppStore = create((set, get) => ({
  session: null,
  isAdmin: false,
  initialized: false,

  initialize: async () => {
    if (!supabase) {
      set({ initialized: true, isAdmin: false });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    const isAdmin = session?.user?.email === adminEmail;

    set({ session, isAdmin, initialized: true });

    supabase.auth.onAuthStateChange((_event, session) => {
      const isAdmin = session?.user?.email === adminEmail;
      set({ session, isAdmin });
    });
  },

  signOut: async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    set({ session: null, isAdmin: false });
  },
}));
