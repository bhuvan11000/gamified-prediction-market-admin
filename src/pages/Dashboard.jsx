import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  Users,
  BarChart3,
  AlertTriangle,
  Clock,
  MessageSquare,
  Activity,
} from 'lucide-react';
import StatCard from '@/components/StatCard';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const { data: counts, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const [users, open, review, pending, proposals, genLog] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'review'),
        supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('community_proposals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('market_generation_log').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      return {
        totalPlayers: users.count ?? 0,
        activeMarkets: open.count ?? 0,
        needsReview: review.count ?? 0,
        pendingAi: pending.count ?? 0,
        pendingProposals: proposals.count ?? 0,
        lastGeneration: genLog.data || null,
      };
    },
    refetchInterval: 30000,
  });

  const stats = [
    { label: 'Total Players', value: counts?.totalPlayers, icon: Users, color: '#4f7df5', linkTo: '/players' },
    { label: 'Active Markets', value: counts?.activeMarkets, icon: BarChart3, color: '#22c55e', linkTo: '/markets' },
    { label: 'Needs Review', value: counts?.needsReview, icon: AlertTriangle, color: '#f59e0b', linkTo: '/markets/review' },
    { label: 'Pending AI Markets', value: counts?.pendingAi, icon: Clock, color: '#a855f7', linkTo: '/markets/approval' },
    { label: 'Pending Proposals', value: counts?.pendingProposals, icon: MessageSquare, color: '#3b82f6', linkTo: '/markets' },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.subtitle}>Overview of the Predict Arena platform</p>

      <div className={styles.grid}>
        {stats.map((s) => (
          <StatCard key={s.label} {...s} loading={isLoading} />
        ))}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Last Market Generation</h2>
        <div className={styles.card}>
          {counts?.lastGeneration ? (
            <div className={styles.genDetails}>
              <div className={styles.genRow}>
                <span className={styles.genLabel}>Status</span>
                <Badge variant={
                  counts.lastGeneration.status === 'success' ? 'success' :
                  counts.lastGeneration.status === 'partial' ? 'warning' : 'danger'
                }>
                  {counts.lastGeneration.status}
                </Badge>
              </div>
              <div className={styles.genRow}>
                <span className={styles.genLabel}>Generated</span>
                <span>{counts.lastGeneration.markets_generated}</span>
              </div>
              <div className={styles.genRow}>
                <span className={styles.genLabel}>Rejected</span>
                <span>{counts.lastGeneration.markets_rejected}</span>
              </div>
              <div className={styles.genRow}>
                <span className={styles.genLabel}>Time</span>
                <span>{formatDateTime(counts.lastGeneration.created_at)}</span>
              </div>
              {counts.lastGeneration.error_details && (
                <div className={styles.genRow}>
                  <span className={styles.genLabel}>Error</span>
                  <span className={styles.errorText}>
                    {typeof counts.lastGeneration.error_details === 'string'
                      ? counts.lastGeneration.error_details
                      : JSON.stringify(counts.lastGeneration.error_details)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className={styles.empty}>No generation runs yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
