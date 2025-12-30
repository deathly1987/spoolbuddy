import { useState } from "preact/hooks";
import { Link } from "wouter-preact";
import { DeviceTopBar } from "../components/DeviceTopBar";
import { DeviceStatusBar } from "../components/DeviceStatusBar";
import { useWebSocket } from "../lib/websocket";
import { Home, Layers, Settings, Tag } from "lucide-preact";

// Navigation button component
function NavButton({
  icon: Icon,
  label,
  href,
  active,
}: {
  icon: typeof Home;
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      class={`flex flex-col items-center justify-center w-16 h-16 rounded-lg transition-colors ${
        active
          ? "bg-bambu-green text-white"
          : "bg-bambu-dark-secondary hover:bg-bambu-dark-tertiary text-white/70 hover:text-white"
      }`}
    >
      <Icon class="w-6 h-6" />
      <span class="text-xs mt-1">{label}</span>
    </Link>
  );
}

export function Main() {
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const { printerStates, printerStatuses } = useWebSocket();

  // Get current printer state
  const printerState = selectedPrinter ? printerStates.get(selectedPrinter) : null;
  const isConnected = selectedPrinter ? printerStatuses.get(selectedPrinter) : false;

  // Get current alert (if any)
  const getAlert = () => {
    if (!isConnected && selectedPrinter) {
      return { type: "warning" as const, message: "Printer disconnected" };
    }
    // Check for low filament in AMS
    if (printerState?.ams_units) {
      for (const unit of printerState.ams_units) {
        for (const tray of unit.trays || []) {
          if (tray.remain !== null && tray.remain < 15 && tray.tray_type) {
            return {
              type: "warning" as const,
              message: `Low Filament: ${tray.tray_type} - ${tray.remain}% remaining`,
            };
          }
        }
      }
    }
    return null;
  };

  return (
    <div class="min-h-screen bg-bambu-dark flex flex-col">
      {/* Top bar */}
      <DeviceTopBar
        selectedPrinter={selectedPrinter}
        onPrinterChange={setSelectedPrinter}
      />

      {/* Main content */}
      <div class="flex-1 flex p-4 gap-4">
        {/* Left side - Status displays */}
        <div class="flex-1 flex flex-col gap-4">
          {/* Print status - main card */}
          <div class="bg-bambu-dark-secondary rounded-lg p-6">
            <div class="flex items-center justify-between mb-4">
              <span class="text-white text-lg font-medium">Print Status</span>
              <span class={`px-3 py-1 rounded-full text-sm font-medium ${
                printerState?.gcode_state === "RUNNING" ? "bg-blue-500/20 text-blue-400" :
                printerState?.gcode_state === "PAUSE" ? "bg-yellow-500/20 text-yellow-400" :
                printerState?.gcode_state === "FINISH" ? "bg-green-500/20 text-green-400" :
                printerState?.gcode_state === "FAILED" ? "bg-red-500/20 text-red-400" :
                "bg-bambu-dark-tertiary text-white/50"
              }`}>
                {printerState?.gcode_state || "Idle"}
              </span>
            </div>

            {printerState?.gcode_state === "RUNNING" && (
              <>
                {/* Progress */}
                <div class="mb-4">
                  <div class="flex justify-between text-sm mb-2">
                    <span class="text-white/50">{printerState.subtask_name || "Printing..."}</span>
                    <span class="text-white font-medium">{printerState.print_progress ?? 0}%</span>
                  </div>
                  <div class="w-full h-3 bg-bambu-dark-tertiary rounded-full overflow-hidden">
                    <div
                      class="h-full bg-bambu-green rounded-full transition-all"
                      style={{ width: `${printerState.print_progress ?? 0}%` }}
                    />
                  </div>
                </div>

                {/* Layer info */}
                {printerState.layer_num !== null && printerState.total_layer_num !== null && (
                  <div class="text-sm text-white/50">
                    Layer {printerState.layer_num} / {printerState.total_layer_num}
                  </div>
                )}
              </>
            )}

            {!printerState?.gcode_state || printerState.gcode_state === "IDLE" && (
              <div class="text-center text-white/30 py-8">
                <Home class="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Printer is idle</p>
              </div>
            )}
          </div>

          {/* AMS summary */}
          {printerState?.ams_units && printerState.ams_units.length > 0 && (
            <div class="bg-bambu-dark-secondary rounded-lg p-4">
              <div class="flex items-center justify-between mb-3">
                <span class="text-white font-medium">AMS Status</span>
                <Link href="/ams" class="text-bambu-green text-sm hover:underline">
                  View Details
                </Link>
              </div>
              <div class="flex gap-2 flex-wrap">
                {printerState.ams_units.flatMap(unit =>
                  unit.trays.map(tray => (
                    tray.tray_type && (
                      <div
                        key={`${unit.id}-${tray.tray_id}`}
                        class="w-8 h-8 rounded-full border-2 border-bambu-dark-tertiary"
                        style={{ backgroundColor: tray.tray_color ? `#${tray.tray_color.slice(0, 6)}` : "#808080" }}
                        title={`${tray.tray_type} - ${tray.remain ?? "?"}%`}
                      />
                    )
                  ))
                )}
              </div>
            </div>
          )}

          {/* No printer selected message */}
          {!selectedPrinter && (
            <div class="flex-1 flex items-center justify-center">
              <div class="text-center text-white/50">
                <p class="text-lg mb-2">No printer selected</p>
                <Link href="/printers" class="text-bambu-green hover:underline">
                  Add a printer
                </Link>
              </div>
            </div>
          )}

          {/* Printer not connected */}
          {selectedPrinter && !isConnected && (
            <div class="flex-1 flex items-center justify-center">
              <div class="text-center text-white/50">
                <p class="text-lg mb-2">Printer disconnected</p>
                <Link href="/printers" class="text-bambu-green hover:underline">
                  Manage printers
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right side - Navigation buttons */}
        <div class="flex flex-col gap-3">
          <NavButton icon={Home} label="Home" href="/main" active />
          <NavButton icon={Layers} label="AMS" href="/ams" />
          <NavButton icon={Tag} label="NFC" href="/inventory" />
          <NavButton icon={Settings} label="Settings" href="/settings" />
        </div>
      </div>

      {/* Bottom status bar */}
      <DeviceStatusBar alert={getAlert()} />
    </div>
  );
}
