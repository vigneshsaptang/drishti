function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function NotificationDropdown({
  isOpen,
  onClose,
  notifications,
  loading,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onNotificationClick,
  onViewAll,
}) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto bg-sap-surface border border-sap-border rounded-xl shadow-xl z-50">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-sap-border">
          <span className="text-xs font-medium text-sap-text">Notifications</span>
          {unreadCount > 0 && (
            <button onClick={onMarkAllRead} className="text-[10px] text-sap-accent hover:underline">
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <p className="text-xs text-sap-dim text-center py-6">Loading...</p>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-sap-muted">No notifications</p>
            <p className="text-xs text-sap-dim mt-1">You're all caught up.</p>
          </div>
        ) : (
          <div>
            {notifications.map(n => (
              <button
                key={String(n._id)}
                onClick={() => {
                  if (!n.read) onMarkRead(String(n._id));
                  onNotificationClick?.(n);
                }}
                className="w-full text-left px-4 py-2.5 border-b border-sap-border/50 hover:bg-sap-bg flex gap-2 items-start transition-colors"
              >
                {!n.read && <span className="w-2 h-2 rounded-full bg-sap-accent mt-1.5 shrink-0" />}
                {n.read && <span className="w-2 h-2 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-sap-text truncate">{n.title}</p>
                  <p className="text-[10px] text-sap-dim truncate">{n.body}</p>
                  <p className="text-[10px] text-sap-muted mt-0.5">{formatTime(n.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-sap-border px-4 py-2 text-center">
          <button onClick={onViewAll} className="text-[10px] text-sap-accent hover:underline">
            View all tickets &rarr;
          </button>
        </div>
      </div>
    </>
  );
}
