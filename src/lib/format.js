export function formatCoins(n) {
  if (n == null || isNaN(n)) return '0';
  return n.toLocaleString('en-US');
}

export function formatXP(n) {
  if (n == null || isNaN(n)) return '0';
  return n.toLocaleString('en-US');
}

export function formatPercent(n) {
  if (n == null || isNaN(n)) return '0%';
  return `${Math.round(n * 100)}%`;
}

export function formatDate(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatDateTime(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatTimeRemaining(isoDate) {
  if (!isoDate) return '\u2014';
  const now = new Date();
  const target = new Date(isoDate);
  const diff = target - now;
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function pluralize(n, word, plural) {
  if (n === 1) return `${n} ${word}`;
  return `${n} ${plural || `${word}s`}`;
}

export function truncateId(str, maxLength = 12) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return `${str.substring(0, 6)}...${str.substring(str.length - 4)}`;
}
