import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  Users,
  ScrollText,
  Settings2,
  LogOut,
  Swords,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/markets', label: 'Markets', icon: BarChart3 },
  { path: '/players', label: 'Players', icon: Users },
  { path: '/quests', label: 'Quests', icon: ScrollText },
  { path: '/system', label: 'System', icon: Settings2 },
];

export default function Sidebar() {
  const signOut = useAppStore((s) => s.signOut);
  const location = useLocation();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Swords size={22} className={styles.brandIcon} />
        <div>
          <h1 className={styles.brandName}>bet.</h1>
          <p className={styles.brandSub}>Admin Panel</p>
        </div>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={styles.userInfo}>
          <span className={styles.userEmail}>{useAppStore.getState().session?.user?.email}</span>
        </div>
        <button className={styles.signOutBtn} onClick={signOut}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
