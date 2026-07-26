import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { formatDateTime, formatCoins, formatPercent } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Search, ChevronDown, ChevronUp, Ban, CheckCircle, Save, X } from 'lucide-react';
import styles from './Players.module.css';

const RANK_OPTIONS = ['Unranked', 'Analyst', 'Strategist', 'Forecaster', 'Visionary', 'Prophet', 'Omniscient'];

const PLAYER_FIELDS = [
  { key: 'username', label: 'Username', type: 'text', min: 3, max: 30, note: '3-30 chars, unique' },
  { key: 'coins', label: 'Coins', type: 'number', min: 0, note: 'Auto-recalculates rank' },
  { key: 'xp', label: 'XP', type: 'number', min: 0, note: 'Auto-recalculates level' },
  { key: 'level', label: 'Level', type: 'number', min: 1, note: 'Overrides XP-based level' },
  { key: 'rank', label: 'Rank', type: 'select', options: RANK_OPTIONS, note: 'Overrides coin-based rank' },
  { key: 'total_predictions', label: 'Total Predictions', type: 'number', min: 0 },
  { key: 'correct_predictions', label: 'Correct Predictions', type: 'number', min: 0 },
  { key: 'betting_streak', label: 'Betting Streak', type: 'number', min: 0 },
  { key: 'longest_streak', label: 'Longest Streak', type: 'number', min: 0 },
  { key: 'last_bet_date', label: 'Last Bet Date', type: 'date' },
  { key: 'last_reward_claim', label: 'Last Reward Claim', type: 'date' },
];

export default function Players() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState({});
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [banModal, setBanModal] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [acting, setActing] = useState(false);
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(0); }, [debounced]);

  const searchQuery = useQuery({
    queryKey: ['players-search', debounced, page],
    queryFn: async () => {
      let query = supabase.from('users').select('*').order('coins', { ascending: false }).limit(20).range(page * 20, (page + 1) * 20 - 1);
      if (debounced) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(debounced);
        if (isUuid) {
          query = query.eq('id', debounced);
        } else {
          query = query.ilike('username', `%${debounced}%`);
        }
      }
      return query;
    },
  });

  const selectedPlayer = searchQuery.data?.data?.find(p => p.id === selectedId) || null;

  async function handleSave(fieldKey, value) {
    if (!selectedId) return;
    setSaving(s => ({ ...s, [fieldKey]: true }));
    try {
      const updates = { [fieldKey]: value };
      if (fieldKey === 'rank' && !RANK_OPTIONS.includes(value)) {
        updates.rank = undefined;
      }
      await api.post('/admin-update-player', { user_id: selectedId, updates });
      addToast(`${fieldKey} updated`, 'success');
      setEditingField(null);
      searchQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(s => ({ ...s, [fieldKey]: false }));
    }
  }

  async function handleBan(userId, ban) {
    setActing(true);
    try {
      await api.post('/admin-ban-player', { user_id: userId, ban, reason: ban ? banReason : undefined });
      addToast(ban ? 'Player banned' : 'Player unbanned', 'success');
      setBanModal(null);
      setBanReason('');
      searchQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setActing(false);
    }
  }

  function startEdit(field) {
    if (!selectedPlayer) return;
    const val = selectedPlayer[field.key];
    setEditingField(field.key);
    setEditValue(val != null ? String(val) : '');
  }

  const players = searchQuery.data?.data || [];
  const totalCount = searchQuery.data?.count || 0;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Players</h1>

      <div className={styles.searchWrap}>
        <Search size={16} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search by username or user ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className={styles.clearBtn} onClick={() => setSearch('')}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className={styles.layout}>
        <div className={styles.tableWrap}>
          {searchQuery.isLoading ? (
            <div className={styles.loadingWrap}><Spinner size={24} /></div>
          ) : players.length === 0 ? (
            <div className={styles.emptyState}>
              <Search size={32} className={styles.emptyIcon} />
              <p>{debounced ? 'No players found' : 'Search for a player to get started'}</p>
            </div>
          ) : (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Level</th>
                    <th>Coins</th>
                    <th>Rank</th>
                    <th>Accuracy</th>
                    <th>Streak</th>
                    <th>Last Login</th>
                    <th>Banned</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr
                      key={p.id}
                      className={`${styles.row} ${selectedId === p.id ? styles.rowSelected : ''}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <td className={styles.usernameCell}>{p.username}</td>
                      <td>{p.level}</td>
                      <td>{formatCoins(p.coins)}</td>
                      <td><span className={`text-rank-${p.rank?.toLowerCase()}`}>{p.rank || 'Unranked'}</span></td>
                      <td>{p.accuracy != null ? formatPercent(p.accuracy) : '\u2014'}</td>
                      <td>{p.betting_streak}</td>
                      <td className={styles.dateCell}>{formatDateTime(p.last_login)}</td>
                      <td>{p.is_banned ? <Badge variant="danger">Banned</Badge> : <Badge variant="success">Active</Badge>}</td>
                      <td>
                        <button className={styles.expandBtn} onClick={(e) => { e.stopPropagation(); setSelectedId(selectedId === p.id ? null : p.id); }}>
                          {selectedId === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalCount > 20 && (
                <div className={styles.pagination}>
                  <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <span className={styles.pageInfo}>Page {page + 1}</span>
                  <Button variant="ghost" size="sm" disabled={players.length < 20} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
        </div>

        {selectedPlayer && (
          <div className={styles.detail}>
            <div className={styles.detailHeader}>
              <h2 className={styles.detailName}>{selectedPlayer.username}</h2>
              <Badge variant={selectedPlayer.is_banned ? 'danger' : 'success'}>
                {selectedPlayer.is_banned ? 'Banned' : 'Active'}
              </Badge>
            </div>
            <p className={styles.detailId}>ID: {selectedPlayer.id}</p>

            <div className={styles.fields}>
              {PLAYER_FIELDS.map((field) => {
                const isEditing = editingField === field.key;
                const rawVal = selectedPlayer[field.key];
                const displayVal = field.type === 'date'
                  ? (rawVal ? rawVal.split('T')[0] : '\u2014')
                  : (rawVal != null ? String(rawVal) : '\u2014');

                return (
                  <div key={field.key} className={styles.fieldRow}>
                    <div className={styles.fieldInfo}>
                      <span className={styles.fieldLabel}>{field.label}</span>
                      {field.note && <span className={styles.fieldNote}>{field.note}</span>}
                    </div>
                    <div className={styles.fieldValue}>
                      {isEditing ? (
                        <div className={styles.editRow}>
                          {field.type === 'select' ? (
                            <select
                              className={styles.editInput}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                            >
                              {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input
                              className={styles.editInput}
                              type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              min={field.min}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave(field.key, field.type === 'number' ? Number(editValue) : editValue);
                                if (e.key === 'Escape') setEditingField(null);
                              }}
                            />
                          )}
                          <button className={styles.saveBtn} onClick={() => handleSave(field.key, field.type === 'number' ? Number(editValue) : editValue)} disabled={saving[field.key]}>
                            {saving[field.key] ? <Spinner size={14} /> : <Save size={14} />}
                          </button>
                          <button className={styles.cancelBtn} onClick={() => setEditingField(null)}><X size={14} /></button>
                        </div>
                      ) : (
                        <button className={styles.valueBtn} onClick={() => startEdit(field)}>
                          <span>{displayVal}</span>
                          <span className={styles.editHint}>click to edit</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.banSection}>
              {selectedPlayer.is_banned ? (
                <Button variant="yes" size="sm" onClick={() => handleBan(selectedPlayer.id, false)} disabled={acting}>
                  <CheckCircle size={14} /> Unban Player
                </Button>
              ) : (
                <Button variant="danger" size="sm" onClick={() => setBanModal(selectedPlayer)}>
                  <Ban size={14} /> Ban Player
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal open={!!banModal} onClose={() => { setBanModal(null); setBanReason(''); }} title="Ban Player" width="400px">
        <p className={styles.banText}>Are you sure you want to ban <strong>{banModal?.username}</strong>?</p>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Reason (optional)</span>
          <input className={styles.input} value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Reason for ban..." />
        </label>
        <div className={styles.confirmActions}>
          <Button variant="ghost" onClick={() => { setBanModal(null); setBanReason(''); }}>Cancel</Button>
          <Button variant="danger" onClick={() => handleBan(banModal.id, true)} disabled={acting}>
            {acting ? <Spinner size={14} /> : <Ban size={14} />} Ban Player
          </Button>
        </div>
      </Modal>
    </div>
  );
}
