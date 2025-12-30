import { Link } from "wouter-preact";

interface Alert {
  type: "warning" | "error" | "info";
  message: string;
  timestamp?: string;
}

interface DeviceStatusBarProps {
  alert?: Alert | null;
  showViewLog?: boolean;
}

export function DeviceStatusBar({ alert, showViewLog = true }: DeviceStatusBarProps) {
  const getStatusColor = () => {
    if (!alert) return "bg-bambu-green";
    switch (alert.type) {
      case "error":
        return "bg-red-500";
      case "warning":
        return "bg-amber-500";
      default:
        return "bg-bambu-green";
    }
  };

  const getBorderColor = () => {
    if (!alert) return "border-bambu-dark-tertiary";
    switch (alert.type) {
      case "error":
        return "border-red-500";
      case "warning":
        return "border-amber-500";
      default:
        return "border-bambu-dark-tertiary";
    }
  };

  return (
    <div class={`h-8 bg-black border-t-2 ${getBorderColor()} flex items-center px-3 gap-3`}>
      {/* Status LED */}
      <div class={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />

      {/* Status message */}
      <div class="flex-1 text-sm text-white/70 truncate">
        {alert ? (
          <span>
            {alert.message}
            {alert.timestamp && (
              <span class="text-white/50 ml-2">- {alert.timestamp}</span>
            )}
          </span>
        ) : (
          <span class="text-bambu-green">System Ready</span>
        )}
      </div>

      {/* View Log link */}
      {showViewLog && (
        <Link
          href="/settings"
          class="text-sm text-white/50 hover:text-white transition-colors"
        >
          View Log &gt;
        </Link>
      )}
    </div>
  );
}
