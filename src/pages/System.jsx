import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import {
  Play, Activity, RefreshCw, RotateCcw, ChevronDown, ChevronRight, Sparkles, Check,
} from 'lucide-react';
import styles from './System.module.css';

const TRIGGERS = [
  { key: 'season', label: 'Run Season Transition', icon: RefreshCw, description: 'Proxies to main app /api/season-transition via CRON_SECRET', endpoint: 'admin-trigger-season', color: '#f59e0b' },
  { key: 'reset-quests', label: 'Reset Expired Quests', icon: RotateCcw, description: 'Proxies to main app /api/reset-quests via CRON_SECRET', endpoint: 'admin-trigger-reset-quests', color: '#a855f7' },
];

export default function System() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState({});
  const [expandedRow, setExpandedRow] = useState(null);

  // Generation flow state
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(null); // { valid, rejected, opens_at }
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [showRejected, setShowRejected] = useState(false);

  const genLogQuery = useQuery({
    queryKey: ['generation-log'],
    queryFn: () => supabase
      .from('market_generation_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
  });

  async function handleGenerate() {
    setGenerating(true);
    setPreview(null);
    setSelected(new Set());
    setShowRejected(false);
    try {
      const data = await api.post('/admin-generate-markets-preview', {});
      setPreview(data);
      setSelected(new Set(data.valid.map((_, i) => i)));
      addToast(`Generated ${data.valid.length} valid markets`, 'success');
    } catch (err) {
      addToast(err.message || 'Generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function toggleSelect(idx) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function handleSave() {
    if (!preview || selected.size === 0) return;
    setSaving(true);
    try {
      const markets = [...selected].map(i => preview.valid[i]);
      const data = await api.post('/admin-save-markets', { markets });
      addToast(`Saved ${data.inserted.length} markets as drafts`, 'success');
      setPreview(null);
      setSelected(new Set());
      genLogQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    } catch (err) {
      addToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTrigger(key, endpoint) {
    setRunning(key);
    setResult(r => ({ ...r, [key]: null }));
    try {
      const data = await api.post(`/${endpoint}`, {});
      setResult(r => ({ ...r, [key]: data }));
      addToast(`${key} triggered successfully`, 'success');
      genLogQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    } catch (err) {
      addToast(err.message, 'error');
      setResult(r => ({ ...r, [key]: { error: err.message } }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>System</h1>

      {/* ── Market Generation ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Market Generation</h2>
        <div className={styles.generatePanel}>

          {!preview ? (
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Spinner size={14} /> : <Sparkles size={14} />}
              {generating ? 'Generating via Gemini…' : 'Generate Markets'}
            </Button>
          ) : (
            <div className={styles.previewWrap}>
              <div className={styles.previewHeader}>
                <span className={styles.previewMeta}>
                  <strong>{preview.valid.length}</strong> valid ·{' '}
                  <strong>{preview.rejected.length}</strong> rejected ·{' '}
                  publishes {new Date(preview.opens_at).toLocaleString()}
                </span>
                <div className={styles.previewActions}>
                  <button className={styles.textBtn} onClick={() => setSelected(new Set(preview.valid.map((_, i) => i)))}>All</button>
                  <button className={styles.textBtn} onClick={() => setSelected(new Set())}>None</button>
                  <Button size="sm" variant="ghost" onClick={handleGenerate} disabled={generating}>
                    {generating ? <Spinner size={12} /> : <RefreshCw size={12} />}
                    Regenerate
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving || selected.size === 0}>
                    {saving ? <Spinner size={12} /> : <Check size={12} />}
                    Save {selected.size} as Drafts
                  </Button>
                </div>
              </div>

              <div className={styles.marketList}>
                {preview.valid.map((market, idx) => (
                  <label
                    key={idx}
                    className={`${styles.marketItem} ${selected.has(idx) ? styles.marketSelected : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(idx)}
                      onChange={() => toggleSelect(idx)}
                      className={styles.checkbox}
                    />
                    <div className={styles.marketBody}>
                      <div className={styles.marketTitle}>{market.title}</div>
                      <div className={styles.marketMeta}>
                        <Badge variant="info">{market.category}</Badge>
                        <span className={styles.closesAt}>
                          closes {new Date(market.closes_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className={styles.marketCriteria}>{market.resolution_criteria}</div>
                    </div>
                  </label>
                ))}
              </div>

              {preview.rejected.length > 0 && (
                <div className={styles.rejected}>
                  <button
                    className={styles.rejectedToggle}
                    onClick={() => setShowRejected(r => !r)}
                  >
                    {showRejected ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {preview.rejected.length} rejected markets
                  </button>
                  {showRejected && (
                    <div className={styles.rejectedList}>
                      {preview.rejected.map((m, i) => (
                        <div key={i} className={styles.rejectedItem}>
                          <span className={styles.rejectedTitle}>{m.title || '(no title)'}</span>
                          <span className={styles.rejectedReasons}>{m.errors?.join(' · ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Manual Cron Triggers ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Manual Cron Triggers</h2>
        <div className={styles.triggers}>
          {TRIGGERS.map(({ key, label, icon: Icon, description, endpoint, color }) => (
            <div key={key} className={styles.triggerCard}>
              <div className={styles.triggerInfo}>
                <div className={styles.triggerIcon} style={{ background: `${color}15`, color }}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className={styles.triggerLabel}>{label}</h3>
                  <p className={styles.triggerDesc}>{description}</p>
                </div>
              </div>
              <div className={styles.triggerActions}>
                {result[key] && !result[key].error && (
                  <div className={styles.triggerResult}><Badge variant="success">Done</Badge></div>
                )}
                {result[key]?.error && (
                  <div className={styles.triggerResult}><Badge variant="danger">Error</Badge></div>
                )}
                <Button
                  size="sm"
                  onClick={() => handleTrigger(key, endpoint)}
                  disabled={running === key}
                >
                  {running === key ? <Spinner size={14} /> : <Play size={14} />}
                  Run
                </Button>
              </div>
              {result[key] && !result[key].error && (
                <pre className={styles.resultJson}>{JSON.stringify(result[key], null, 2)}</pre>
              )}
              {result[key]?.error && (
                <pre className={`${styles.resultJson} ${styles.resultError}`}>{result[key].error}</pre>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Market Generation Log ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Market Generation Log</h2>
        <div className={styles.logTable}>
          {genLogQuery.isLoading ? (
            <div className={styles.loadingWrap}><Spinner size={24} /></div>
          ) : genLogQuery.data?.data?.length === 0 ? (
            <div className={styles.emptyState}>
              <Activity size={32} className={styles.emptyIcon} />
              <p>No generation log entries yet.</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Created At</th>
                  <th>Status</th>
                  <th>Generated</th>
                  <th>Rejected</th>
                  <th>Error Details</th>
                </tr>
              </thead>
              <tbody>
                {genLogQuery.data?.data?.map((entry) => (
                  <>
                    <tr
                      key={entry.id}
                      className={styles.logRow}
                      onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                    >
                      <td>
                        {entry.error_details && (
                          <span className={styles.expandIcon}>
                            {expandedRow === entry.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        )}
                      </td>
                      <td className={styles.dateCell}>{formatDateTime(entry.created_at)}</td>
                      <td>
                        <Badge variant={
                          entry.status === 'success' ? 'success' :
                          entry.status === 'partial' ? 'warning' : 'danger'
                        }>
                          {entry.status}
                        </Badge>
                      </td>
                      <td>{entry.markets_generated}</td>
                      <td>{entry.markets_rejected}</td>
                      <td className={styles.errorCell}>
                        {entry.error_details
                          ? <Badge variant="warning">Has Details</Badge>
                          : <span className={styles.none}>None</span>}
                      </td>
                    </tr>
                    {expandedRow === entry.id && entry.error_details && (
                      <tr key={`${entry.id}-details`}>
                        <td colSpan={6}>
                          <pre className={styles.detailsJson}>
                            {JSON.stringify(entry.error_details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
