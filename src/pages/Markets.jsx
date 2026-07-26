import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { formatDateTime, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  CheckCircle, XCircle, AlertTriangle, Plus, ExternalLink, Edit3,
} from 'lucide-react';
import styles from './Markets.module.css';

const SECTIONS = [
  { key: 'approval', label: 'AI Approval Queue' },
  { key: 'review', label: 'Dispute Resolution' },
  { key: 'create', label: 'Manual Creation' },
];

const CATEGORIES = ['sports', 'tech', 'popculture', 'politics', 'memes'];

const STATUS_BADGE = {
  pending: { variant: 'warning', label: 'Pending' },
  open: { variant: 'success', label: 'Open' },
  closed: { variant: 'default', label: 'Closed' },
  resolving: { variant: 'info', label: 'Resolving' },
  resolved: { variant: 'info', label: 'Resolved' },
  review: { variant: 'warning', label: 'Review' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
  rejected: { variant: 'danger', label: 'Rejected' },
};

export default function Markets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get('section') || 'approval';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [confirmModal, setConfirmModal] = useState(null);
  const [acting, setActing] = useState(false);

  const pendingQuery = useQuery({
    queryKey: ['markets-pending'],
    queryFn: () => supabase.from('markets').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    enabled: section === 'approval',
  });

  const reviewQuery = useQuery({
    queryKey: ['markets-review'],
    queryFn: () => supabase.from('markets').select('*').eq('status', 'review').order('created_at', { ascending: false }),
    enabled: section === 'review',
  });

  async function handleApproveReject(marketId, action) {
    setActing(true);
    try {
      const body = { market_id: marketId, action };
      if (editModal?.id === marketId && Object.keys(editForm).length > 0) {
        body.edits = editForm;
      }
      await api.post('/admin-approve-market', body);
      addToast(`Market ${action === 'approve' ? 'approved' : 'rejected'}`, 'success');
      setEditModal(null);
      setEditForm({});
      pendingQuery.refetch();
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

  function openEdit(market) {
    setEditForm({
      title: market.title,
      description: market.description,
      category: market.category,
      resolution_criteria: market.resolution_criteria,
      closes_at: market.closes_at?.split('T')[0] || '',
    });
    setEditModal(market);
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

      {/* ── AI APPROVAL QUEUE ── */}
      {section === 'approval' && (
        <div>
          {pendingQuery.isLoading ? (
            <div className={styles.loadingWrap}><Spinner size={24} /></div>
          ) : pendingQuery.data?.data?.length === 0 ? (
            <div className={styles.emptyState}>
              <CheckCircle size={40} className={styles.emptyIcon} />
              <p>No pending AI markets to review.</p>
            </div>
          ) : (
            <div className={styles.queue}>
              {pendingQuery.data?.data?.map((market) => (
                <div key={market.id} className={styles.marketCard}>
                  <div className={styles.marketHeader}>
                    <h3 className={styles.marketTitle}>{market.title}</h3>
                    <Badge variant={STATUS_BADGE[market.status]?.variant}>{STATUS_BADGE[market.status]?.label}</Badge>
                  </div>
                  <p className={styles.marketDesc}>{market.description}</p>
                  <div className={styles.marketMeta}>
                    <span><strong>Category:</strong> {market.category}</span>
                    <span><strong>Created:</strong> {formatDateTime(market.created_at)}</span>
                    <span><strong>Closes:</strong> {formatDate(market.closes_at)}</span>
                  </div>
                  <p className={styles.marketCriteria}><strong>Resolution:</strong> {market.resolution_criteria}</p>
                  <div className={styles.marketActions}>
                    <Button variant="yes" size="sm" onClick={() => openEdit(market)} disabled={acting}>
                      <Edit3 size={14} /> Review & Approve
                    </Button>
                    <Button variant="no" size="sm" onClick={() => setConfirmModal({ type: 'reject', marketId: market.id, title: market.title })} disabled={acting}>
                      <XCircle size={14} /> Reject
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
              {reviewQuery.data?.data?.map((market) => (
                <div key={market.id} className={styles.marketCard}>
                  <div className={styles.marketHeader}>
                    <h3 className={styles.marketTitle}>{market.title}</h3>
                    <Badge variant="warning">Needs Review</Badge>
                  </div>
                  <p className={styles.marketDesc}>{market.description}</p>
                  <div className={styles.marketMeta}>
                    <span><strong>Category:</strong> {market.category}</span>
                    <span><strong>Resolved At:</strong> {formatDateTime(market.resolved_at)}</span>
                  </div>
                  <p className={styles.marketCriteria}><strong>Resolution Criteria:</strong> {market.resolution_criteria}</p>
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

      {/* ── EDIT MODAL ── */}
      <Modal open={!!editModal} onClose={() => { setEditModal(null); setEditForm({}); }} title="Review Market" width="600px">
        <div className={styles.editForm}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Title</span>
            <input className={styles.input} value={editForm.title || ''} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Description</span>
            <textarea className={`${styles.input} ${styles.textarea}`} value={editForm.description || ''} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Category</span>
            <select className={styles.input} value={editForm.category || ''} onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Resolution Criteria</span>
            <textarea className={`${styles.input} ${styles.textarea}`} value={editForm.resolution_criteria || ''} onChange={(e) => setEditForm(f => ({ ...f, resolution_criteria: e.target.value }))} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Close Date</span>
            <input className={styles.input} type="date" value={editForm.closes_at || ''} onChange={(e) => setEditForm(f => ({ ...f, closes_at: e.target.value }))} />
          </label>
          <div className={styles.editActions}>
            <Button variant="ghost" onClick={() => { setEditModal(null); setEditForm({}); }}>Cancel</Button>
            <Button variant="yes" onClick={() => handleApproveReject(editModal.id, 'approve')} disabled={acting}>
              {acting ? <Spinner size={14} /> : <CheckCircle size={14} />} Approve
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── CONFIRM MODAL ── */}
      <Modal open={!!confirmModal} onClose={() => setConfirmModal(null)} title="Confirm Action" width="400px">
        <p className={styles.confirmText}>
          {confirmModal?.type === 'reject' && `Are you sure you want to reject "${confirmModal?.title}"?`}
          {confirmModal?.type === 'resolve-yes' && `Resolve "${confirmModal?.title}" as YES? This will pay out YES position holders.`}
          {confirmModal?.type === 'resolve-no' && `Resolve "${confirmModal?.title}" as NO? This will pay out NO position holders.`}
          {confirmModal?.type === 'cancel' && `Cancel "${confirmModal?.title}" and refund all participants?`}
        </p>
        <div className={styles.confirmActions}>
          <Button variant="ghost" onClick={() => setConfirmModal(null)}>Go Back</Button>
          {confirmModal?.type === 'reject' && (
            <Button variant="danger" onClick={() => handleApproveReject(confirmModal.marketId, 'reject')} disabled={acting}>
              {acting ? <Spinner size={14} /> : null} Reject Market
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
