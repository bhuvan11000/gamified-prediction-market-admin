import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { formatDateTime, formatDate, formatTimeRemaining } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  CheckCircle, XCircle, AlertTriangle, Plus, ExternalLink, Trash2, Clock,
} from 'lucide-react';
import styles from './Markets.module.css';

const SECTIONS = [
  { key: 'drafts', label: 'Draft Queue' },
  { key: 'review', label: 'Dispute Resolution' },
  { key: 'create', label: 'Manual Creation' },
];

const CATEGORIES = ['sports', 'tech', 'popculture', 'politics', 'memes'];

const STATUS_BADGE = {
  draft: { variant: 'warning', label: 'Draft' },
  pending: { variant: 'warning', label: 'Pending' },
  open: { variant: 'success', label: 'Open' },
  closed: { variant: 'default', label: 'Closed' },
  resolving: { variant: 'info', label: 'Resolving' },
  resolved: { variant: 'info', label: 'Resolved' },
  review: { variant: 'warning', label: 'Review' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
  rejected: { variant: 'danger', label: 'Rejected' },
};

const SOURCE_LABELS = {
  ai: 'Daily',
  admin: 'Admin',
  community: 'Community',
};

export default function Markets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get('section') || 'drafts';
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [confirmModal, setConfirmModal] = useState(null);
  const [acting, setActing] = useState(false);

  const draftQuery = useQuery({
    queryKey: ['markets-drafts'],
    queryFn: () => supabase.from('markets').select('*').eq('status', 'draft').order('created_at', { ascending: false }),
    enabled: section === 'drafts',
  });

  const reviewQuery = useQuery({
    queryKey: ['markets-review'],
    queryFn: async () => {
      // Fetch markets in review
      const { data: markets } = await supabase
        .from('markets')
        .select('*')
        .eq('status', 'review')
        .order('created_at', { ascending: false });

      // Fetch disputes for all of them
      if (markets && markets.length > 0) {
        const marketIds = markets.map(m => m.id);
        const { data: disputes } = await supabase
          .from('market_disputes')
          .select('*, user:user_id(username)')
          .in('market_id', marketIds)
          .order('created_at', { ascending: true });

        // Attach disputes to their market
        const disputeMap = {};
        for (const d of disputes || []) {
          if (!disputeMap[d.market_id]) disputeMap[d.market_id] = [];
          disputeMap[d.market_id].push(d);
        }

        return markets.map(m => ({
          ...m,
          disputes: disputeMap[m.id] || [],
          dispute_count: (disputeMap[m.id] || []).length,
        }));
      }

      return markets || [];
    },
    enabled: section === 'review',
  });

  async function handleDelete(marketId) {
    setActing(true);
    try {
      await api.post('/admin-delete-market', { market_id: marketId });
      addToast('Draft deleted', 'success');
      setConfirmModal(null);
      draftQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setActing(false);
    }
  }

  async function handleResolve(marketId, resolution) {
    setActing(true);
    try {
      await api.post('/admin-resolve-market', { market_id: marketId, resolution });
      addToast(`Market resolved as ${resolution}`, 'success');
      setConfirmModal(null);
      reviewQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setActing(false);
    }
  }

  async function handleCancel(marketId) {
    setActing(true);
    try {
      await api.post('/admin-cancel-market', { market_id: marketId });
      addToast('Market cancelled and refunded', 'success');
      setConfirmModal(null);
      reviewQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setActing(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Markets</h1>

      <div className={styles.tabs}>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={`${styles.tab} ${section === s.key ? styles.tabActive : ''}`}
            onClick={() => setSearchParams({ section: s.key })}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── DRAFT QUEUE ── */}
      {section === 'drafts' && (
        <div>
          {draftQuery.isLoading ? (
            <div className={styles.loadingWrap}><Spinner size={24} /></div>
          ) : draftQuery.data?.data?.length === 0 ? (
            <div className={styles.emptyState}>
              <Clock size={40} className={styles.emptyIcon} />
              <p>No drafts pending publication.</p>
            </div>
          ) : (
            <div className={styles.queue}>
              {draftQuery.data?.data?.map((market) => (
                <div key={market.id} className={styles.marketCard}>
                  <div className={styles.marketHeader}>
                    <h3 className={styles.marketTitle}>{market.title}</h3>
                    <Badge variant={STATUS_BADGE[market.status]?.variant}>{STATUS_BADGE[market.status]?.label}</Badge>
                  </div>
                  <p className={styles.marketDesc}>{market.description}</p>
                  <div className={styles.marketMeta}>
                    <span><strong>Source:</strong> {SOURCE_LABELS[market.source] || market.source}</span>
                    <span><strong>Category:</strong> {market.category}</span>
                    <span><strong>Created:</strong> {formatDateTime(market.created_at)}</span>
                  </div>
                  <p className={styles.marketCriteria}>
                    <strong>Auto-publishes:</strong> {formatTimeRemaining(market.opens_at)}
                  </p>
                  <div className={styles.marketActions}>
                    <Button variant="danger" size="sm" onClick={() => setConfirmModal({ type: 'delete', marketId: market.id, title: market.title })} disabled={acting}>
                      <Trash2 size={14} /> Delete Draft
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DISPUTE RESOLUTION ── */}
      {section === 'review' && (
        <div>
          {reviewQuery.isLoading ? (
            <div className={styles.loadingWrap}><Spinner size={24} /></div>
          ) : reviewQuery.data?.data?.length === 0 ? (
            <div className={styles.emptyState}>
              <AlertTriangle size={40} className={styles.emptyIcon} />
              <p>No markets currently needing review.</p>
            </div>
          ) : (
            <div className={styles.queue}>
              {reviewQuery.data?.map((market) => (
                <div key={market.id} className={styles.marketCard}>
                  <div className={styles.marketHeader}>
                    <h3 className={styles.marketTitle}>{market.title}</h3>
                    <Badge variant="warning">Needs Review</Badge>
                  </div>
                  <p className={styles.marketDesc}>{market.description}</p>
                  <div className={styles.marketMeta}>
                    <span><strong>Category:</strong> {market.category}</span>
                    <span><strong>Resolved At:</strong> {formatDateTime(market.resolved_at)}</span>
                    {market.dispute_count > 0 && (
                      <span className={styles.disputeCount}>
                        <AlertTriangle size={12} /> {market.dispute_count} dispute{market.dispute_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {market.failed_resolutions > 0 && (
                      <span className={styles.failCount}>
                        Resolution failed {market.failed_resolutions}×
                      </span>
                    )}
                  </div>
                  <p className={styles.marketCriteria}><strong>Resolution Criteria:</strong> {market.resolution_criteria}</p>

                  {/* Dispute list */}
                  {market.disputes && market.disputes.length > 0 && (
                    <div className={styles.disputeList}>
                      <p className={styles.disputeListTitle}>Disputes:</p>
                      {market.disputes.map((d) => (
                        <div key={d.id} className={styles.disputeItem}>
                          <span className={styles.disputeUser}>{d.user?.username || 'Unknown'}</span>
                          <span className={styles.disputeReason}>{d.reason}</span>
                          <span className={styles.disputeDate}>{formatDateTime(d.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={styles.marketActions}>
                    <Button variant="yes" size="sm" onClick={() => setConfirmModal({ type: 'resolve-yes', marketId: market.id, title: market.title })} disabled={acting}>
                      <CheckCircle size={14} /> Resolve YES
                    </Button>
                    <Button variant="no" size="sm" onClick={() => setConfirmModal({ type: 'resolve-no', marketId: market.id, title: market.title })} disabled={acting}>
                      <XCircle size={14} /> Resolve NO
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmModal({ type: 'cancel', marketId: market.id, title: market.title })} disabled={acting}>
                      Cancel & Refund
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MANUAL CREATION ── */}
      {section === 'create' && <CreateMarketForm onCreated={() => { addToast('Market created', 'success'); queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] }); }} />}

      {/* ── CONFIRM MODAL ── */}
      <Modal open={!!confirmModal} onClose={() => setConfirmModal(null)} title="Confirm Action" width="400px">
        <p className={styles.confirmText}>
          {confirmModal?.type === 'delete' && `Delete draft "${confirmModal?.title}"? This cannot be undone.`}
          {confirmModal?.type === 'resolve-yes' && `Resolve "${confirmModal?.title}" as YES? This will pay out YES position holders.`}
          {confirmModal?.type === 'resolve-no' && `Resolve "${confirmModal?.title}" as NO? This will pay out NO position holders.`}
          {confirmModal?.type === 'cancel' && `Cancel "${confirmModal?.title}" and refund all participants?`}
        </p>
        <div className={styles.confirmActions}>
          <Button variant="ghost" onClick={() => setConfirmModal(null)}>Go Back</Button>
          {confirmModal?.type === 'delete' && (
            <Button variant="danger" onClick={() => handleDelete(confirmModal.marketId)} disabled={acting}>
              {acting ? <Spinner size={14} /> : null} Delete Draft
            </Button>
          )}
          {confirmModal?.type === 'resolve-yes' && (
            <Button variant="yes" onClick={() => handleResolve(confirmModal.marketId, 'yes')} disabled={acting}>
              {acting ? <Spinner size={14} /> : null} Resolve YES
            </Button>
          )}
          {confirmModal?.type === 'resolve-no' && (
            <Button variant="no" onClick={() => handleResolve(confirmModal.marketId, 'no')} disabled={acting}>
              {acting ? <Spinner size={14} /> : null} Resolve NO
            </Button>
          )}
          {confirmModal?.type === 'cancel' && (
            <Button variant="danger" onClick={() => handleCancel(confirmModal.marketId)} disabled={acting}>
              {acting ? <Spinner size={14} /> : null} Cancel & Refund
            </Button>
          )}
        </div>
      </Modal>
    </div>
  );
}

function CreateMarketForm({ onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', category: 'tech', resolution_criteria: '', closes_at: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();

  function validate() {
    const e = {};
    if (form.title.length < 10 || form.title.length > 200) e.title = 'Title must be 10-200 characters';
    if (!form.title.trim().endsWith('?')) e.title = 'Title must end with ?';
    if (form.description.length < 20 || form.description.length > 500) e.description = 'Description must be 20-500 characters';
    if (form.resolution_criteria.length < 20 || form.resolution_criteria.length > 300) e.resolution_criteria = 'Resolution criteria must be 20-300 characters';
    if (!form.closes_at) e.closes_at = 'Close date is required';
    else {
      const d = new Date(form.closes_at);
      const now = new Date();
      const max = new Date(now.getTime() + 90 * 86400000);
      if (d < now) e.closes_at = 'Close date must be in the future';
      else if (d > max) e.closes_at = 'Close date must be within 90 days';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await api.post('/admin-create-market', form);
      addToast('Market created successfully', 'success');
      setForm({ title: '', description: '', category: 'tech', resolution_criteria: '', closes_at: '' });
      onCreated?.();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.createForm} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Title (10-200 chars, must end with ?)</span>
        <input className={`${styles.input} ${errors.title ? styles.inputError : ''}`} value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Will Bitcoin reach $100k by end of 2026?" />
        {errors.title && <span className={styles.fieldError}>{errors.title}</span>}
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Description (20-500 chars)</span>
        <textarea className={`${styles.input} ${styles.textarea} ${errors.description ? styles.inputError : ''}`} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Provide context for this prediction market..." />
        {errors.description && <span className={styles.fieldError}>{errors.description}</span>}
      </label>
      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Category</span>
          <select className={styles.input} value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Close Date (1-90 days)</span>
          <input className={`${styles.input} ${errors.closes_at ? styles.inputError : ''}`} type="date" value={form.closes_at} onChange={(e) => setForm(f => ({ ...f, closes_at: e.target.value }))} />
          {errors.closes_at && <span className={styles.fieldError}>{errors.closes_at}</span>}
        </label>
      </div>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Resolution Criteria (20-300 chars)</span>
        <textarea className={`${styles.input} ${styles.textarea} ${errors.resolution_criteria ? styles.inputError : ''}`} value={form.resolution_criteria} onChange={(e) => setForm(f => ({ ...f, resolution_criteria: e.target.value }))} placeholder="Exactly what determines YES vs NO..." />
        {errors.resolution_criteria && <span className={styles.fieldError}>{errors.resolution_criteria}</span>}
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? <Spinner size={14} /> : <Plus size={16} />} Create Market
      </Button>
    </form>
  );
}
