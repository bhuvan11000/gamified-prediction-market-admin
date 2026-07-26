import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { LogIn } from 'lucide-react';
import styles from './AdminGuard.module.css';

export default function AdminGuard({ children }) {
  const { session, isAdmin } = useAppStore();

  if (!supabase) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>Configuration Required</h1>
          <p className={styles.text}>
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your environment.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>Predict Arena Admin</h1>
          <p className={styles.text}>Sign in with your admin account to continue.</p>
          <button
            className={styles.signInBtn}
            onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
          >
            <LogIn size={18} />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>Access Denied</h1>
          <p className={styles.text}>
            You do not have admin access. Please sign in with the admin account.
          </p>
          <button
            className={styles.signInBtn}
            onClick={() => supabase.auth.signOut()}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return children;
}
