import { useState } from "preact/hooks";
import { Link } from "wouter-preact";
import { DeviceTopBar } from "../components/DeviceTopBar";
import { DeviceStatusBar } from "../components/DeviceStatusBar";
import { useWebSocket, AmsUnit, AmsTray } from "../lib/websocket";
import { Home, Layers, Settings, Tag } from "lucide-preact";

// Convert tray color to CSS
function trayColorToCSS(color: string | null): string {
  if (!color) return "#808080";
  const hex = color.slice(0, 6);
  return `#${hex}`;
}

// Check if tray is empty
function isTrayEmpty(tray: AmsTray): boolean {
  return !tray.tray_type || tray.tray_type === "";
}

// Get AMS display name
function getAmsName(amsId: number): string {
  if (amsId <= 3) {
    return `AMS ${String.fromCharCode(65 + amsId)}`;
  } else if (amsId >= 128 && amsId <= 135) {
    return `AMS HT ${String.fromCharCode(65 + amsId - 128)}`;
  }
  return `AMS ${amsId}`;
}

// Spool slot component
function SpoolSlot({
  tray,
  slotIndex,
  isActive,
}: {
  tray: AmsTray;
  slotIndex: number;
  isActive: boolean;
}) {
  const isEmpty = isTrayEmpty(tray);
  const color = trayColorToCSS(tray.tray_color);

  return (
    <div
      class={`relative flex flex-col items-center p-2 rounded-lg transition-all ${
        isActive ? "ring-2 ring-bambu-green" : ""
      }`}
    >
      {/* Spool visualization */}
      <div class="relative w-14 h-14 mb-1">
        {isEmpty ? (
          <div class="w-full h-full rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center ams-empty-slot">
            <div class="w-3 h-3 rounded-full bg-gray-600" />
          </div>
        ) : (
          <svg viewBox="0 0 56 56" class="w-full h-full">
            {/* Outer ring */}
            <circle cx="28" cy="28" r="26" fill={color} />
            {/* Inner shadow */}
            <circle cx="28" cy="28" r="20" fill={color} style={{ filter: "brightness(0.85)" }} />
            {/* Highlight */}
            <ellipse cx="20" cy="20" rx="6" ry="4" fill="white" opacity="0.3" />
            {/* Center hole */}
            <circle cx="28" cy="28" r="8" fill="#2d2d2d" />
            <circle cx="28" cy="28" r="5" fill="#1a1a1a" />
          </svg>
        )}
        {/* Active indicator */}
        {isActive && (
          <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-bambu-green rounded-full" />
        )}
      </div>

      {/* Material type */}
      <span class="text-xs text-white/70 truncate max-w-full">
        {isEmpty ? "Empty" : tray.tray_type || "Unknown"}
      </span>

      {/* Fill level bar */}
      {!isEmpty && tray.remain !== null && tray.remain !== undefined && (
        <div class="w-full h-1 bg-bambu-dark-tertiary rounded-full overflow-hidden mt-1">
          <div
            class="h-full rounded-full transition-all"
            style={{
              width: `${tray.remain}%`,
              backgroundColor: tray.remain > 50 ? "#22c55e" : tray.remain > 20 ? "#f59e0b" : "#ef4444",
            }}
          />
        </div>
      )}

      {/* Slot number */}
      <span class="absolute top-1 right-1 text-[10px] text-white/30">
        {slotIndex + 1}
      </span>
    </div>
  );
}

// AMS unit card
function AmsUnitCard({
  unit,
  activeSlot,
}: {
  unit: AmsUnit;
  activeSlot: number | null;
}) {
  const trays = unit.trays || [];
  const humidity = unit.humidity;

  return (
    <div class="bg-bambu-dark-secondary rounded-lg p-3">
      {/* Header */}
      <div class="flex items-center justify-between mb-3">
        <span class="text-white font-medium">{getAmsName(unit.id)}</span>
        {humidity !== null && humidity !== undefined && (
          <div class="flex items-center gap-1 text-xs text-white/50">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
            <span>{humidity > 5 ? `${humidity}%` : `Level ${humidity}`}</span>
          </div>
        )}
      </div>

      {/* Slots grid */}
      <div class="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((slotIndex) => {
          const tray = trays[slotIndex] || {
            id: slotIndex,
            tray_color: null,
            tray_type: "",
            remain: null,
          };
          return (
            <SpoolSlot
              key={slotIndex}
              tray={tray}
              slotIndex={slotIndex}
              isActive={activeSlot === slotIndex}
            />
          );
        })}
      </div>
    </div>
  );
}

// Navigation button
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

export function AmsOverview() {
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const { printerStates, printerStatuses } = useWebSocket();

  // Get current printer state
  const printerState = selectedPrinter ? printerStates.get(selectedPrinter) : null;
  const isConnected = selectedPrinter ? printerStatuses.get(selectedPrinter) : false;

  // Get AMS units from printer state
  const amsUnits: AmsUnit[] = printerState?.ams_units || [];
  const trayNow = printerState?.tray_now ?? null;

  // Calculate active slot for each AMS
  const getActiveSlotForAms = (amsId: number): number | null => {
    if (trayNow === null || trayNow === undefined || trayNow === 255) return null;
    if (amsId <= 3) {
      const activeAmsId = Math.floor(trayNow / 4);
      if (activeAmsId === amsId) {
        return trayNow % 4;
      }
    }
    return null;
  };

  // Get alert
  const getAlert = () => {
    if (!isConnected && selectedPrinter) {
      return { type: "warning" as const, message: "Printer disconnected" };
    }
    // Check for low filament
    for (const unit of amsUnits) {
      for (const tray of unit.trays || []) {
        if (tray.remain !== null && tray.remain < 15 && tray.tray_type) {
          return {
            type: "warning" as const,
            message: `Low Filament: ${tray.tray_type} (${getAmsName(unit.id)}) - ${tray.remain}% remaining`,
          };
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
        {/* Left side - AMS grid */}
        <div class="flex-1">
          {amsUnits.length > 0 ? (
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              {amsUnits.map((unit) => (
                <AmsUnitCard
                  key={unit.id}
                  unit={unit}
                  activeSlot={getActiveSlotForAms(unit.id)}
                />
              ))}
            </div>
          ) : (
            <div class="flex-1 flex items-center justify-center h-full">
              <div class="text-center text-white/50">
                {selectedPrinter ? (
                  isConnected ? (
                    <>
                      <Layers class="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p class="text-lg mb-2">No AMS detected</p>
                      <p class="text-sm">Connect an AMS to see filament slots</p>
                    </>
                  ) : (
                    <>
                      <p class="text-lg mb-2">Printer disconnected</p>
                      <Link href="/printers" class="text-bambu-green hover:underline">
                        Manage printers
                      </Link>
                    </>
                  )
                ) : (
                  <>
                    <p class="text-lg mb-2">No printer selected</p>
                    <Link href="/printers" class="text-bambu-green hover:underline">
                      Add a printer
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right side - Navigation */}
        <div class="flex flex-col gap-3">
          <NavButton icon={Home} label="Home" href="/main" />
          <NavButton icon={Layers} label="AMS" href="/ams" active />
          <NavButton icon={Tag} label="NFC" href="/inventory" />
          <NavButton icon={Settings} label="Settings" href="/settings" />
        </div>
      </div>

      {/* Bottom status bar */}
      <DeviceStatusBar alert={getAlert()} />
    </div>
  );
}
