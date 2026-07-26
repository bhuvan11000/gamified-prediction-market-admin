import { useNavigate } from 'react-router-dom';
import styles from './StatCard.module.css';

export default function StatCard({ label, value, icon: Icon, color, linkTo, loading }) {
  const navigate = useNavigate();

  return (
    <div
      className={styles.card}
      onClick={() => linkTo && navigate(linkTo)}
      style={{ cursor: linkTo ? 'pointer' : 'default' }}
    >
      <div className={styles.iconWrap} style={{ background: `${color}15`, color }}>
        <Icon size={20} />
      </div>
      <div className={styles.info}>
        <p className={styles.label}>{label}</p>
        {loading ? (
          <div className={styles.skeleton} />
        ) : (
          <p className={styles.value}>{value ?? '\u2014'}</p>
        )}
      </div>
    </div>
  );
}
