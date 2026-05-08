export default function FeedbackFab({ onClick, unreadCount = 0 }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 z-40 w-11 h-11 rounded-full bg-sap-accent hover:bg-sap-accent/90 text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 sm:bottom-3 sm:right-3"
      title="Send Feedback"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-entity-drug" />
      )}
    </button>
  );
}
