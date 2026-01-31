import { useEffect, useState, useCallback } from "preact/hooks";
import { api, Spool, SpoolInput, SpoolsInPrinters, SlotAssignment } from "../lib/api";
import {
  SpoolsTable,
  StatsBar,
  AddSpoolModal,
  DeleteModal,
  ColumnConfigModal,
  getDefaultColumns,
  ColumnConfig,
  PrinterWithCalibrations,
} from "../components/inventory";
import { AssignAmsModal } from "../components/AssignAmsModal";
import { Plus } from "lucide-preact";
import { useToast } from "../lib/toast";
import { useWebSocket } from "../lib/websocket";

const COLUMN_CONFIG_KEY = "spoolbuddy-column-config";

function loadColumnConfig(): ColumnConfig[] {
  try {
    const stored = localStorage.getItem(COLUMN_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ColumnConfig[];
      // Validate and merge with defaults (in case new columns were added)
      const defaults = getDefaultColumns();
      const defaultIds = new Set(defaults.map((c) => c.id));
      const storedIds = new Set(parsed.map((c) => c.id));

      // Keep stored columns that still exist
      const validStored = parsed.filter((c) => defaultIds.has(c.id));

      // Add any new columns that weren't in stored config
      const newColumns = defaults.filter((c) => !storedIds.has(c.id));

      return [...validStored, ...newColumns];
    }
  } catch {
    // Ignore errors
  }
  return getDefaultColumns();
}

function saveColumnConfig(config: ColumnConfig[]) {
  try {
    localStorage.setItem(COLUMN_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Ignore errors
  }
}

export function Inventory() {
  const [spools, setSpools] = useState<Spool[]>([]);
  const [spoolsInPrinters] = useState<SpoolsInPrinters>({}); // TODO: Get from printer state
  const [slotAssignments, setSlotAssignments] = useState<Record<string, SlotAssignment[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const { subscribe } = useWebSocket();

  // Printers and their calibrations for PA Profile tab
  const [printersWithCalibrations, setPrintersWithCalibrations] = useState<PrinterWithCalibrations[]>([]);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTagId, setAddTagId] = useState<string | null>(null); // Tag ID to pre-fill when adding
  const [addWeight, setAddWeight] = useState<number | null>(null); // Weight to pre-fill when adding
  const [editSpool, setEditSpool] = useState<Spool | null>(null);
  const [deleteSpool, setDeleteSpool] = useState<Spool | null>(null);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignModalSpool, setAssignModalSpool] = useState<Spool | null>(null);

  // Handle URL query parameters (edit, add, tagId, weight)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    const addParam = params.get('add');
    const tagIdParam = params.get('tagId');
    const weightParam = params.get('weight');

    if (editId && spools.length > 0) {
      const spoolToEdit = spools.find(s => s.id === editId);
      if (spoolToEdit) {
        setEditSpool(spoolToEdit);
        // Clear the URL param without navigating
        window.history.replaceState({}, '', '/inventory');
      }
    } else if (addParam === 'true') {
      setAddTagId(tagIdParam); // May be null if not provided
      setAddWeight(weightParam ? parseInt(weightParam, 10) : null);
      setShowAddModal(true);
      // Clear the URL param without navigating
      window.history.replaceState({}, '', '/inventory');
    }
  }, [spools]);

  // Column configuration
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(loadColumnConfig);

  const loadSpools = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listSpools();
      setSpools(data);
    } catch (e) {
      console.error("Failed to load spools:", e);
      setError(e instanceof Error ? e.message : "Failed to load spools");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load printers and their calibrations
  const loadPrintersAndCalibrations = useCallback(async () => {
    try {
      const printers = await api.listPrinters();
      console.log('Loading printers and assignments:', printers.map(p => p.serial));
      const printersData: PrinterWithCalibrations[] = [];
      const assignmentsMap: Record<string, SlotAssignment[]> = {};

      for (const printer of printers) {
        // Only fetch calibrations for connected printers
        if (printer.connected) {
          try {
            const calibrations = await api.getCalibrations(printer.serial);
            printersData.push({ printer, calibrations });
          } catch {
            // If calibrations fail, include printer with empty calibrations
            printersData.push({ printer, calibrations: [] });
          }

          // Load slot assignments for this printer
          try {
            const assignments = await api.getSlotAssignments(printer.serial);
            assignmentsMap[printer.serial] = assignments;
          } catch (e) {
            // If assignments fail, use empty list
            assignmentsMap[printer.serial] = [];
          }
        } else {
          // Printer not connected - include with empty calibrations
          printersData.push({ printer, calibrations: [] });
          assignmentsMap[printer.serial] = [];
        }
      }

      setPrintersWithCalibrations(printersData);
      setSlotAssignments(assignmentsMap);
      console.log('Final loaded slotAssignments:', assignmentsMap);
    } catch (e) {
      console.error("Failed to load printers:", e);
    }
  }, []);

  useEffect(() => {
    loadSpools();
    loadPrintersAndCalibrations();

    // Subscribe to printer connection events to refresh calibrations
    const unsubscribe = subscribe((message) => {
      if (message.type === "printer_connected" || message.type === "printer_disconnected") {
        // Wait a bit for the connection to stabilize before fetching calibrations
        setTimeout(() => {
          loadPrintersAndCalibrations();
        }, 2000);
      }
    });

    return unsubscribe;
  }, [loadSpools, loadPrintersAndCalibrations, subscribe]);

  const handleAddSpool = async (input: SpoolInput) => {
    const spool = await api.createSpool(input);
    await loadSpools();
    return spool;
  };

  const handleEditSpool = async (input: SpoolInput) => {
    if (!editSpool) throw new Error('No spool to edit');
    const spool = await api.updateSpool(editSpool.id, input);
    await loadSpools();
    return spool;
  };

  const handleDeleteSpool = async (spool: Spool) => {
    try {
      await api.deleteSpool(spool.id);
      await loadSpools();
      showToast('success', `Deleted "${spool.color_name || spool.material}" spool`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to delete spool');
    }
  };

  const handleArchiveSpool = async (spool: Spool) => {
    try {
      await api.archiveSpool(spool.id);
      await loadSpools();
      showToast('success', `Archived "${spool.color_name || spool.material}" spool`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to archive spool');
    }
  };

  const handleRestoreSpool = async (spool: Spool) => {
    try {
      await api.restoreSpool(spool.id);
      await loadSpools();
      showToast('success', `Restored "${spool.color_name || spool.material}" spool`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to restore spool');
    }
  };

  const handleColumnConfigSave = (config: ColumnConfig[]) => {
    setColumnConfig(config);
    saveColumnConfig(config);
  };

  const reloadAssignments = useCallback(async () => {
    try {
      const printers = await api.listPrinters();
      const assignmentsMap: Record<string, SlotAssignment[]> = {};

      for (const printer of printers) {
        try {
          const assignments = await api.getSlotAssignments(printer.serial);
          assignmentsMap[printer.serial] = assignments;
        } catch (e) {
          assignmentsMap[printer.serial] = [];
        }
      }

      setSlotAssignments(assignmentsMap);
    } catch (e) {
      console.error("Failed to reload assignments:", e);
    }
  }, []);

  const handleSyncWeight = async (spool: Spool) => {
    if (spool.weight_current === null) return;
    try {
      await api.setSpoolWeight(spool.id, spool.weight_current);
      await loadSpools();
      const spoolName = [spool.brand, spool.material, spool.color_name].filter(Boolean).join(' ');
      showToast('success', `Synced "${spoolName}" to scale weight`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to sync weight');
    }
  };

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-3xl font-bold text-[var(--text-primary)]">Inventory</h1>
          <p class="text-[var(--text-secondary)]">Manage your filament spools</p>
        </div>
        <button onClick={() => setShowAddModal(true)} class="btn btn-primary">
          <Plus class="w-5 h-5" />
          <span>Add Spool</span>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div class="p-4 bg-[var(--error-color)]/10 border border-[var(--error-color)]/30 rounded-lg text-[var(--error-color)]">
          {error}
        </div>
      )}

      {/* Stats */}
      {!loading && spools.length > 0 && (
        <StatsBar spools={spools} spoolsInPrinters={spoolsInPrinters} />
      )}

      {/* Loading state */}
      {loading ? (
        <div class="card p-12 text-center text-[var(--text-muted)]">
          Loading...
        </div>
      ) : (
        /* Spools table */
        <SpoolsTable
          spools={spools}
          spoolsInPrinters={spoolsInPrinters}
          slotAssignments={slotAssignments}
          columnConfig={columnConfig}
          onEditSpool={(spool) => setEditSpool(spool)}
          onSyncWeight={handleSyncWeight}
          onOpenColumns={() => setShowColumnModal(true)}
          onAddSpool={() => setShowAddModal(true)}
        />
      )}

      {/* Add Spool Modal */}
      <AddSpoolModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setAddTagId(null);
          setAddWeight(null);
        }}
        onSave={handleAddSpool}
        printersWithCalibrations={printersWithCalibrations}
        initialTagId={addTagId}
        initialWeight={addWeight}
      />

      {/* Edit Spool Modal */}
      <AddSpoolModal
        isOpen={!!editSpool}
        onClose={() => setEditSpool(null)}
        onSave={handleEditSpool}
        editSpool={editSpool}
        onDelete={(spool) => setDeleteSpool(spool)}
        onArchive={handleArchiveSpool}
        onRestore={handleRestoreSpool}
        onTagRemoved={loadSpools}
        onConfigureAms={(spool) => {
          setAssignModalSpool(spool);
          setShowAssignModal(true);
          setEditSpool(null);
        }}
        printersWithCalibrations={printersWithCalibrations}
      />

      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={!!deleteSpool}
        onClose={() => setDeleteSpool(null)}
        spool={deleteSpool}
        onDelete={handleDeleteSpool}
      />

      {/* Assign to AMS Modal */}
      {assignModalSpool && (
        <AssignAmsModal
          isOpen={showAssignModal}
          onClose={() => {
            setShowAssignModal(false);
            setAssignModalSpool(null);
            // Reload assignments after modal closes (to show the newly assigned spool)
            reloadAssignments();
          }}
          spool={assignModalSpool}
        />
      )}

      {/* Column Configuration Modal */}
      <ColumnConfigModal
        isOpen={showColumnModal}
        onClose={() => setShowColumnModal(false)}
        columns={columnConfig}
        onSave={handleColumnConfigSave}
      />
    </div>
  );
}
