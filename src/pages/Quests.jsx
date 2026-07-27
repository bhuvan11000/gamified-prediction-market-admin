import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { Search, Plus, CheckCircle, X, User } from 'lucide-react';
import styles from './Quests.module.css';

export default function Quests() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [quests, setQuests] = useState([]);
  const [loadingQuest, setLoadingQuest] = useState(false);
  const [acting, setActing] = useState(null);
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const searchQuery = useQuery({
    queryKey: ['players-search-quests', search],
    queryFn: () => {
      if (!search) return { data: [] };
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search);
      if (isUuid) return supabase.from('users').select('id, username, level').eq('id', search).limit(10);
      return supabase.from('users').select('id, username, level').ilike('username', `%${search}%`).limit(10);
    },
  });

  async function loadQuests(userId) {
    setSelectedId(userId);
    setQuests([]);
    setLoadingQuest(true);
    try {
      const data = await api.get('/admin-player-quests', { user_id: userId });
      setQuests(data.quests || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoadingQuest(false);
    }
  }

  async function handleForceQuest(userQuestId, action) {
    setActing(userQuestId);
    try {
      await api.post('/admin-force-quest', { user_quest_id: userQuestId, action });
      addToast(`Quest ${action === 'complete' ? 'completed' : 'incremented'}`, 'success');
      loadQuests(selectedId);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setActing(null);
    }
  }

  const players = searchQuery.data?.data || [];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Player Quests</h1>

      <div className={styles.searchWrap}>
        <Search size={16} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search player by username or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.layout}>
        <div className={styles.playerList}>
          {searchQuery.isLoading ? (
            <div className={styles.loadingWrap}><Spinner size={24} /></div>
          ) : players.length === 0 ? (
            <div className={styles.emptyState}>
              <User size={32} className={styles.emptyIcon} />
              <p>{search ? 'No players found' : 'Search for a player'}</p>
            </div>
          ) : (
            <div className={styles.list}>
              {players.map((p) => (
                <button
                  key={p.id}
                  className={`${styles.playerItem} ${selectedId === p.id ? styles.playerItemActive : ''}`}
                  onClick={() => loadQuests(p.id)}
                >
                  <div className={styles.playerInfo}>
                    <span className={styles.playerName}>{p.username}</span>
                    <span className={styles.playerLevel}>Level {p.level}</span>
                  </div>
                  <ChevronIcon />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.questPanel}>
          {!selectedId && (
            <div className={styles.emptyState}>
              <User size={40} className={styles.emptyIcon} />
              <p>Select a player to view their quests</p>
            </div>
          )}

          {selectedId && loadingQuest && (
            <div className={styles.loadingWrap}><Spinner size={24} /></div>
          )}

          {selectedId && !loadingQuest && quests.length === 0 && (
            <div className={styles.emptyState}>
              <p>No active quests for this player.</p>
            </div>
          )}

          {selectedId && !loadingQuest && quests.length > 0 && (
            <div className={styles.questsList}>
              <h2 className={styles.questsTitle}>
                Quests for <strong>{players.find(p => p.id === selectedId)?.username}</strong>
              </h2>
              {quests.map((q) => (
                <div key={q.id} className={styles.questCard}>
                  <div className={styles.questHeader}>
                    <h3 className={styles.questTitle}>{q.title}</h3>
                    <Badge variant={q.type === 'daily' ? 'info' : 'warning'}>
                      {q.type}
                    </Badge>
                  </div>
                  <p className={styles.questDesc}>{q.description}</p>
                  <div className={styles.questProgress}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }}
                      />
                    </div>
                    <span className={styles.progressText}>{q.progress}/{q.target}</span>
                  </div>
                  <div className={styles.questMeta}>
                    <span>{q.action_type}</span>
                    {q.completed && <Badge variant="success">Completed</Badge>}
                    {q.reset_at && <span>Resets: {formatDateTime(q.reset_at)}</span>}
                  </div>
                  {!q.completed && (
                    <div className={styles.questActions}>
                      <Button size="sm" variant="ghost" onClick={() => handleForceQuest(q.id, 'increment')} disabled={acting === q.id}>
                        {acting === q.id ? <Spinner size={12} /> : <Plus size={12} />} Increment
                      </Button>
                      <Button size="sm" variant="yes" onClick={() => handleForceQuest(q.id, 'complete')} disabled={acting === q.id}>
                        {acting === q.id ? <Spinner size={12} /> : <CheckCircle size={12} />} Complete
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
