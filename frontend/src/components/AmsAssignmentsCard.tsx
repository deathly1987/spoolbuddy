import { Printer } from '../lib/api';
import { useWebSocket, AmsUnit } from '../lib/websocket';
import { SpoolIcon } from './AmsCard';

interface AmsAssignmentsCardProps {
  printers: Printer[];
}

export function AmsAssignmentsCard({ printers }: AmsAssignmentsCardProps) {
  const { printerStates, printerStatuses } = useWebSocket();

  // Get AMS display name
  const getAmsName = (amsId: number): string => {
    if (amsId <= 3) {
      return `AMS ${String.fromCharCode(65 + amsId)}`; // A, B, C, D
    } else if (amsId >= 128 && amsId <= 135) {
      return `HT-${String.fromCharCode(65 + amsId - 128)}`; // HT-A, HT-B, ...
    } else if (amsId === 254) {
      return 'External Left';
    } else if (amsId === 255) {
      return 'External';
    }
    return `AMS ${amsId}`;
  };

  // Get slot name
  const getSlotName = (amsId: number, trayId: number): string => {
    const amsName = getAmsName(amsId);
    if (amsId >= 128 || amsId === 254 || amsId === 255) {
      return amsName; // Single-slot units
    }
    return `${amsName} Slot ${trayId}`;
  };

  // Collect all assignments
  const assignments: Array<{
    printerSerial: string;
    printerName: string;
    amsId: number;
    trayId: number;
    slotName: string;
    tray: any;
    unit: AmsUnit | undefined;
  }> = [];

  for (const printer of printers) {
    const connected = printerStatuses.get(printer.serial) ?? printer.connected ?? false;
    if (!connected) continue;

    const state = printerStates.get(printer.serial);
    if (!state) continue;

    // Collect from regular AMS units
    for (const unit of state.ams_units || []) {
      for (const tray of unit.trays || []) {
        if (tray.tray_type) {
          assignments.push({
            printerSerial: printer.serial,
            printerName: printer.name || printer.serial,
            amsId: unit.id,
            trayId: tray.tray_id,
            slotName: getSlotName(unit.id, tray.tray_id),
            tray,
            unit,
          });
        }
      }
    }

    // Collect from virtual tray (external)
    if (state.vt_tray && state.vt_tray.tray_type) {
      const vtAmsId = state.vt_tray.ams_id || 255;
      assignments.push({
        printerSerial: printer.serial,
        printerName: printer.name || printer.serial,
        amsId: vtAmsId,
        trayId: state.vt_tray.tray_id,
        slotName: getSlotName(vtAmsId, state.vt_tray.tray_id),
        tray: state.vt_tray,
        unit: undefined,
      });
    }
  }

  if (assignments.length === 0) {
    return (
      <div class="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] p-6">
        <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-4">AMS Assignments</h2>
        <div class="text-center text-[var(--text-muted)] py-8">
          No filaments assigned to AMS slots
        </div>
      </div>
    );
  }

  // Group by printer
  const byPrinter = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const key = assignment.printerSerial;
    if (!byPrinter.has(key)) {
      byPrinter.set(key, []);
    }
    byPrinter.get(key)!.push(assignment);
  }

  return (
    <div class="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] p-6">
      <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-4">AMS Assignments</h2>

      <div class="space-y-4">
        {Array.from(byPrinter.entries()).map(([serial, printerAssignments]) => (
          <div key={serial} class="space-y-2">
            {/* Printer name header */}
            <h3 class="text-sm font-medium text-[var(--text-secondary)]">
              {printerAssignments[0].printerName}
            </h3>

            {/* Assignments grid */}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              {printerAssignments.map((assignment) => (
                <div
                  key={`${assignment.amsId}-${assignment.trayId}`}
                  class="flex items-center gap-3 p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                  {/* Spool icon */}
                  <div class="flex-shrink-0">
                    <SpoolIcon
                      color={
                        assignment.tray.tray_color
                          ? `#${assignment.tray.tray_color.slice(0, 6)}`
                          : '#808080'
                      }
                      isEmpty={false}
                      size={40}
                    />
                  </div>

                  {/* Info */}
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-[var(--text-primary)]">
                      {assignment.tray.tray_type}
                      {assignment.tray.tray_sub_brands && (
                        <span class="text-xs text-[var(--text-muted)] block">
                          {assignment.tray.tray_sub_brands}
                        </span>
                      )}
                    </div>
                    <div class="text-xs text-[var(--text-muted)]">
                      {assignment.slotName}
                    </div>
                  </div>

                  {/* Remaining */}
                  {assignment.tray.remain !== null && (
                    <div class="flex-shrink-0 text-right">
                      <div class="text-xs font-mono text-[var(--text-primary)]">
                        {assignment.tray.remain}%
                      </div>
                      <div
                        class="mt-1 w-8 h-1 rounded-full bg-[var(--bg-tertiary)] overflow-hidden"
                        style={{ background: '#4CAF50' }}
                      >
                        <div
                          class="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, assignment.tray.remain || 0)}%`,
                            background: '#4CAF50',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
