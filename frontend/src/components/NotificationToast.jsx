export default function NotificationToast({ message }) {
  if (!message) return null;

  return (
    <div className="fixed bottom-4 right-4 max-w-xs rounded border bg-white p-3 shadow-lg">
      <div className="text-sm font-semibold">Nouvelle notification</div>
      <div className="text-sm mt-1">{message}</div>
    </div>
  );
}
