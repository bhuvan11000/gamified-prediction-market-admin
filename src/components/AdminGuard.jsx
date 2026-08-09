import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import Spinner from '@/components/ui/Spinner';
import styles from './AdminGuard.module.css';

export default function AdminGuard({ children }) {
  const { session, isAdmin } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
          <h1 className={styles.title}>bet. Admin</h1>
          <p className={styles.text}>Sign in with your admin account to continue.</p>
          <form className={styles.form} onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setLoading(true);
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) setError(error.message);
            setLoading(false);
          }}>
            <input
              className={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.signInBtn} type="submit" disabled={loading}>
              {loading ? <Spinner size={14} /> : null}
              Sign In
            </button>
          </form>
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
