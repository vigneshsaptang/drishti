import { useState, useEffect, useCallback, useRef } from 'react';
import { getUnreadCount, getNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/api';

const POLL_INTERVAL = 60_000;

export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetchUnread = useCallback(() => {
    getUnreadCount().then(d => setUnreadCount(d.unread_count ?? 0)).catch(() => {});
  }, []);

  const fetchNotifications = useCallback(() => {
    setLoading(true);
    getNotifications({ per_page: '30' }).then(d => {
      setNotifications(d.notifications || []);
      setUnreadCount(d.unread_count ?? 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const markRead = useCallback(async (id) => {
    setUnreadCount(prev => Math.max(0, prev - 1));
    setNotifications(prev => prev.map(n => String(n._id) === id ? { ...n, read: true } : n));
    await markNotificationRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await markAllNotificationsRead();
  }, []);

  useEffect(() => {
    fetchUnread();
    intervalRef.current = setInterval(fetchUnread, POLL_INTERVAL);

    const onVisibility = () => {
      if (!document.hidden) fetchUnread();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchUnread]);

  return { unreadCount, notifications, loading, fetchNotifications, markRead, markAllRead };
}
