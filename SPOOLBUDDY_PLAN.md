# SpoolBuddy - Project Plan

> A smart filament management system for Bambu Lab 3D printers.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Hardware](#hardware)
4. [Software Components](#software-components)
5. [Development Phases](#development-phases)
6. [Technical Details](#technical-details)
7. [Feature Comparison Checklist](#feature-comparison-checklist)

---

## Project Overview

### What is SpoolBuddy?

SpoolBuddy is a reimagined filament management system that combines:
- **NFC-based spool identification** - Read/write tags on filament spools
- **Weight tracking** - Integrated scale for precise filament measurement
- **Inventory management** - Track all your spools, usage, and K-profiles
- **Automatic printer configuration** - Auto-configure AMS slots via MQTT

### Architecture Design

| Aspect | Choice |
|--------|--------|
| Architecture | Server + ESP32 Device |
| Display | ESP32-S3 + 4.3" (800×480) |
| Console + Scale | Combined unit |
| Device UI | LVGL (embedded) |
| Web UI | Dedicated server (Preact) |
| Database | SQLite on server |
| NFC Reader | PN5180 (~20cm range) |

### Goals

1. **Modern UI** - Professional web-based interface accessible from any device
2. **Easy updates** - Server updates don't require device reflashing
3. **Multi-device** - Same web UI on device, tablet, browser
4. **Maintainable** - Standard web stack, custom ESP32 firmware
5. **Independent** - No external code dependencies, fully owned codebase

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                      SERVER (Docker)                        │
│                                                             │
│  ┌──────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │Python Backend│  │   Web UI    │  │  Database   │        │
│  │  (FastAPI)   │  │  (Preact)   │  │  (SQLite)   │        │
│  │              │  │             │  │             │        │
│  │ • MQTT       │  │ • Inventory │  │ • Spools    │        │
│  │ • REST API   │  │ • Printers  │  │ • Printers  │        │
│  │ • WebSocket  │  │ • Dashboard │  │ • K-Values  │        │
│  │ • Tag decode │  │ • Settings  │  │ • History   │        │
│  └──────┬───────┘  └──────┬──────┘  └─────────────┘        │
│         │                 │                                 │
│         └─────────────────┘                                 │
│                  │                                          │
└──────────────────┼──────────────────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │ HTTP/WS      │              │ WebSocket
    ▼              ▼              ▼
┌─────────┐  ┌─────────┐  ┌─────────────────────────────────┐
│ Browser │  │ Tablet  │  │      SpoolBuddy Device          │
│         │  │         │  │                                 │
│ Web UI  │  │ Web UI  │  │  ┌───────────────────────────┐  │
│         │  │         │  │  │  ESP32-S3-Touch-LCD-4.3   │  │
└─────────┘  └─────────┘  │  │  (Waveshare)              │  │
                          │  │                           │  │
                          │  │  • 4.3" 800×480 touch     │  │
                          │  │  • WiFi + BLE 5           │  │
                          │  │  • 8MB Flash, 8MB PSRAM   │  │
                          │  │  • Custom firmware (Rust) │  │
                          │  │                           │  │
                          │  │  Peripherals:             │  │
                          │  │  ├── PN5180 (SPI) - NFC   │  │
                          │  │  └── HX711 (GPIO) - Scale │  │
                          │  └───────────────────────────┘  │
                          │                                 │
                          │      ┌───────┐  ┌───────┐       │
                          │      │PN5180 │  │ Scale │       │
                          │      │  NFC  │  │ HX711 │       │
                          │      └───────┘  └───────┘       │
                          └─────────────────────────────────┘
```

### Communication Flow

```
ESP32 Device                    Server
     │                            │
     │◄────── WebSocket ─────────►│
     │        • Tag detected      │
     │        • Weight changed    │
     │        • Tag write cmd     │
     │        • Config sync       │
     │                            │
     │◄────── HTTP ──────────────►│
     │        • Web UI (browser)  │
     │        • OTA updates       │
     │                            │
```

---

## Hardware

### Device Components

| Component | Choice | Interface | Notes |
|-----------|--------|-----------|-------|
| **Main Board** | Waveshare ESP32-S3-Touch-LCD-4.3 | - | ESP32-S3, 8MB Flash, 8MB PSRAM |
| **Display** | Built-in 4.3" IPS | Parallel RGB | 800×480, 5-point capacitive touch |
| **NFC Reader** | PN5180 module | SPI | Extended range (~20cm), MIFARE Crypto1 support |
| **Scale** | HX711 + Load Cell | GPIO | Standard load cell setup |
| **Power** | USB-C 5V/2A | - | Single power input |

### ESP32-S3-Touch-LCD-4.3 Specifications

- **Processor**: Xtensa 32-bit LX7 dual-core, up to 240MHz
- **Memory**: 512KB SRAM, 384KB ROM, 8MB PSRAM, 8MB Flash
- **Wireless**: 2.4GHz WiFi (802.11 b/g/n), Bluetooth 5 (LE)
- **Display**: 4.3" IPS, 800×480, 65K colors, capacitive touch (I2C, 5-point)
- **Interfaces**: SPI, I2C, UART, CAN, RS485, USB, TF card slot
- **Wiki**: https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-4.3

### Hardware Sources

| Component | Source | Price | Status |
|-----------|--------|-------|--------|
| ESP32 Display | [Amazon.de](https://www.amazon.de/dp/B0CNZ6CHR7) | ~€45 | Ordered |
| NFC Reader | [LaskaKit.cz](https://www.laskakit.cz/en/rfid-ctecka-s-vestavenou-antenou-nfc-rf-pn5180-iso15693-cteni-i-zapis/) | €10.23 | Ordered |
| HX711 + Load Cell | TBD | ~€10 | TBD |

### GPIO Pin Allocation

```
ESP32-S3-Touch-LCD-4.3 GPIO (directly from connectors):

PN5180 (SPI - directly on expansion header):
  - MOSI: GPIO 11
  - MISO: GPIO 13
  - SCLK: GPIO 12
  - NSS:  GPIO 10
  - BUSY: GPIO 14
  - RST:  GPIO 21

HX711 (Scale - directly on expansion header):
  - DT:   GPIO 1
  - SCK:  GPIO 2

Note: Pin assignments TBD based on available GPIOs on expansion connectors.
      Check Waveshare wiki for actual pinout.
```

### Physical Design

- Combined Console + Scale in single case
- NFC antenna (PN5180) positioned under scale platform center
- Spool sits on platform, center hole aligns with NFC reader
- Extended NFC range (~20cm) enables reading Bambu Lab tags inside spool core
- 4.3" display angled for visibility
- Single USB-C power input

---

## Software Components

### 1. Server Backend (Python)

**Framework:** FastAPI + Uvicorn

**Responsibilities:**
- REST API for web UI
- WebSocket for device communication
- MQTT client for Bambu Lab printers
- Tag encoding/decoding (SpoolEase, Bambu Lab, OpenPrintTag formats)
- Database operations (SQLite)
- Serve static web UI

**Structure:**
```
backend/
├── main.py           # FastAPI app, WebSocket handler
├── config.py         # Settings
├── models.py         # Pydantic models
├── api/              # REST API routes
│   ├── spools.py
│   └── printers.py
├── db/               # Database layer
│   └── database.py
├── mqtt/             # Printer MQTT client
│   ├── client.py
│   └── bambu_api.rs  # Message structures
└── tags/             # NFC tag encoding/decoding
    ├── spoolease_format.py
    ├── bambulab.py
    └── openprinttag.py
```

### 2. Web UI (Preact + TypeScript)

**Framework:** Preact + Vite + TailwindCSS

**Pages:**
- **Dashboard** - Overview, printer status, current print
- **Inventory** - Spool list, search, filter
- **Printers** - Printer configuration, AMS status
- **Spool Detail** - Edit spool, K-profiles, history
- **Settings** - Server config, device settings

**Features:**
- Responsive design (desktop, tablet, device screen)
- Real-time updates via WebSocket
- Works in browser and on device's built-in display

### 3. Device Firmware (Rust/ESP32)

**Target:** ESP32-S3-Touch-LCD-4.3 (Waveshare)

**Framework:** esp-hal + embassy (async)

**Responsibilities:**
- Read NFC tags (PN5180 via SPI)
- Read scale weight (HX711 via GPIO)
- Display UI (LVGL or custom)
- WiFi connection to server
- WebSocket communication
- Local display of spool info, weight, status

**Structure:**
```
firmware/
├── Cargo.toml
├── src/
│   ├── main.rs         # Entry point, task spawning
│   ├── wifi.rs         # WiFi connection
│   ├── websocket.rs    # Server communication
│   ├── nfc/
│   │   ├── mod.rs
│   │   └── pn5180.rs   # PN5180 driver
│   ├── scale/
│   │   ├── mod.rs
│   │   └── hx711.rs    # HX711 driver
│   └── ui/
│       ├── mod.rs
│       └── screens.rs  # LVGL screens
└── build.rs
```

**Key Crates:**
- `esp-hal` - ESP32-S3 hardware abstraction
- `embassy-executor` - Async runtime
- `embassy-net` - Networking
- `embedded-graphics` or `lvgl` - UI rendering

---

## Development Phases

### Phase 1: Foundation ✅ Complete

**Goal:** Basic working system, prove architecture

**Server:**
- [x] FastAPI server with REST API
- [x] SQLite database schema and migrations
- [x] Spool CRUD operations
- [x] WebSocket endpoint for UI updates
- [x] Static file serving for web UI

**Web UI:**
- [x] Inventory page with search/filter
- [x] Spool detail/edit modal
- [x] Stats bar with inventory overview
- [x] WebSocket integration for live updates

**Deliverable:** Can view/edit spools via web UI

### Phase 2: Printer Integration ✅ Complete

**Goal:** Connect to Bambu Lab printers via MQTT

**Server:**
- [x] MQTT client for printer communication
- [x] Printer state tracking (print status, AMS data)
- [x] AMS slot configuration commands
- [x] K-profile selection per slot
- [x] RFID re-read trigger (`ams_get_rfid`)
- [x] Tag encoding/decoding (SpoolEase V2, Bambu Lab, OpenPrintTag)

**Web UI:**
- [x] Printer management page (add/edit/delete)
- [x] Real-time printer status display
- [x] AMS slot visualization with colors, materials, K-values
- [x] Active tray indicator
- [x] Slot context menu (re-read RFID, select K-profile)

**Deliverable:** Full printer MQTT integration with AMS control

### Phase 3: Device Firmware 🔄 Next

**Goal:** ESP32-S3 firmware for NFC + Scale

**Firmware:**
- [ ] Project setup (esp-hal + embassy)
- [ ] WiFi connection and config portal
- [ ] WebSocket client to server
- [ ] PN5180 NFC driver (SPI)
- [ ] HX711 scale driver (GPIO)
- [ ] Basic LVGL UI (weight display, status)
- [ ] Tag read → WebSocket → Server flow

**Server:**
- [x] WebSocket handler for tag_detected messages
- [x] Tag decoding and spool matching
- [ ] Tag write command handling

**Deliverable:** Device reads NFC tags and weight, sends to server

### Phase 4: Filament Tracking

**Goal:** Track filament usage during prints

**Server:**
- [ ] G-code analysis for filament usage
- [ ] FTP client for printer file access
- [ ] Real-time usage tracking during print
- [ ] Consumption history per spool

**Web UI:**
- [ ] Print progress display
- [ ] Usage history graphs
- [ ] Low stock warnings

**Deliverable:** Accurate filament tracking, usage history

### Phase 5: K-Profile Management

**Goal:** Full pressure advance calibration management

**Server:**
- [ ] K-profile storage per spool/printer/nozzle
- [ ] Auto-restore K values when loading spool
- [ ] Import K values from printer

**Web UI:**
- [ ] K-profile editor
- [ ] Per-printer/nozzle configuration

**Deliverable:** Full pressure advance management

### Phase 6: NFC Writing & Advanced Features

**Goal:** Complete feature set

**Firmware:**
- [ ] NFC tag writing (SpoolEase V2 format)
- [ ] Scale calibration
- [ ] Offline mode with sync

**Server:**
- [ ] Tag write command generation
- [ ] Backup/restore functionality

**Web UI:**
- [ ] Tag encoding page
- [ ] Backup/restore UI
- [ ] Settings page

**Deliverable:** Full-featured filament management

### Phase 7: Polish & Documentation

**Goal:** Production ready

- [ ] Error handling and edge cases
- [ ] Performance optimization
- [ ] User documentation
- [ ] Installation guide
- [ ] Docker compose setup
- [ ] Firmware build/flash instructions

---

## Technical Details

### Database Schema (SQLite)

```sql
-- Spools table
CREATE TABLE spools (
    id TEXT PRIMARY KEY,
    tag_id TEXT UNIQUE,
    material TEXT NOT NULL,
    subtype TEXT,
    color_name TEXT,
    rgba TEXT,
    brand TEXT,
    label_weight INTEGER DEFAULT 1000,
    core_weight INTEGER DEFAULT 250,
    weight_new INTEGER,
    weight_current INTEGER,
    slicer_filament TEXT,
    note TEXT,
    added_time INTEGER,
    encode_time INTEGER,
    added_full BOOLEAN DEFAULT FALSE,
    consumed_since_add REAL DEFAULT 0,
    consumed_since_weight REAL DEFAULT 0,
    data_origin TEXT,
    tag_type TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Printers table
CREATE TABLE printers (
    serial TEXT PRIMARY KEY,
    name TEXT,
    model TEXT,
    ip_address TEXT,
    access_code TEXT,
    last_seen INTEGER,
    config JSON
);

-- K-Profiles table
CREATE TABLE k_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spool_id TEXT REFERENCES spools(id),
    printer_serial TEXT REFERENCES printers(serial),
    extruder INTEGER,
    nozzle_diameter TEXT,
    nozzle_type TEXT,
    k_value TEXT,
    name TEXT,
    cali_idx INTEGER,
    setting_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Usage history table
CREATE TABLE usage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spool_id TEXT REFERENCES spools(id),
    printer_serial TEXT,
    print_name TEXT,
    weight_used REAL,
    timestamp INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### WebSocket Protocol

**Device → Server:**

```json
// Tag detected
{
    "type": "tag_detected",
    "tag_id": "04:AB:CD:EF:12:34:56",
    "tag_type": "ntag215",
    "data": { /* parsed tag data */ }
}

// Tag removed
{
    "type": "tag_removed"
}

// Weight update
{
    "type": "weight",
    "grams": 1234.5,
    "stable": true
}

// Heartbeat
{
    "type": "heartbeat",
    "uptime": 12345
}
```

**Server → Device:**

```json
// Write tag command
{
    "type": "write_tag",
    "request_id": "abc123",
    "data": { /* tag data to write */ }
}

// Tare scale
{
    "type": "tare_scale"
}

// Calibrate scale
{
    "type": "calibrate_scale",
    "known_weight": 500
}

// Show notification on device
{
    "type": "notification",
    "message": "Spool loaded: PLA Red",
    "duration": 3000
}
```

### REST API Endpoints

```
GET    /api/spools              - List all spools
POST   /api/spools              - Create spool
GET    /api/spools/:id          - Get spool
PUT    /api/spools/:id          - Update spool
DELETE /api/spools/:id          - Delete spool

GET    /api/printers            - List printers
POST   /api/printers            - Add printer
GET    /api/printers/:serial    - Get printer
PUT    /api/printers/:serial    - Update printer
DELETE /api/printers/:serial    - Remove printer

GET    /api/k-profiles/:spool   - Get K-profiles for spool
POST   /api/k-profiles          - Save K-profile
DELETE /api/k-profiles/:id      - Delete K-profile

GET    /api/device/status       - Device connection status
POST   /api/device/tare         - Tare scale
POST   /api/device/write-tag    - Write NFC tag

WS     /ws/device               - Device WebSocket
WS     /ws/ui                   - UI WebSocket (live updates)
```

### Project Structure

```
spoolbuddy/
├── backend/                    # Python server
│   ├── main.py
│   ├── config.py
│   ├── models.py
│   ├── requirements.txt
│   ├── api/
│   │   ├── __init__.py
│   │   ├── spools.py
│   │   └── printers.py
│   ├── db/
│   │   ├── __init__.py
│   │   └── database.py
│   ├── mqtt/
│   │   ├── __init__.py
│   │   ├── client.py
│   │   └── bambu_api.py
│   └── tags/
│       ├── __init__.py
│       ├── models.py
│       ├── decoder.py
│       ├── spoolease_format.py
│       ├── bambulab.py
│       └── openprinttag.py
│
├── web/                        # Preact frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── lib/
│   └── public/
│
├── firmware/                   # ESP32-S3 firmware (Rust)
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── wifi.rs
│   │   ├── websocket.rs
│   │   ├── nfc/
│   │   │   └── pn5180.rs
│   │   ├── scale/
│   │   │   └── hx711.rs
│   │   └── ui/
│   │       └── screens.rs
│   └── build.rs
│
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── SPOOLBUDDY_PLAN.md
├── CLAUDE.md
├── LICENSE
└── README.md
```

---

## Feature Comparison Checklist

> Reference checklist for filament management system features.
> Use this to track implementation progress and identify gaps.

### Backend - BambuPrinter Module (`core/src/bambu.rs`)

**Printer State Management:**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `nozzle_type_code()` | Determine nozzle type (Standard/HighFlow) | ❌ Missing |
| `printer_name()` / `set_printer_name()` | Get/set printer display name | ✅ Implemented |
| `is_locked()` | Check printer locked mode | ❌ Missing |
| `model()` / `model_series()` | Get printer model/series | ⚠️ Partial |
| `get_extruder()` | Retrieve extruder config by ID | ✅ Implemented |
| `num_extruders()` | Get extruder count | ⚠️ Hardcoded |

**AMS Tray Management:**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `ams_trays()` | Get all AMS tray slots | ✅ Implemented |
| `virt_trays()` | Get virtual/external trays | ✅ Implemented |
| `swap_ams_tray()` | Exchange tray at index | ❌ Missing |
| `update_ams_tray()` / `update_virt_tray()` | Modify tray with callback | ✅ Implemented |
| `get_any_tray()` | Retrieve any tray by unified index | ✅ Implemented |
| `reset_tray()` | Clear/reset tray data | ✅ Implemented |
| `set_tray_filament()` | Load filament into tray | ✅ Implemented |

**AMS Status Bitmaps:**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `ams_exist_bits()` / `set_ams_exist_bits()` | AMS existence bitmap | ❌ Missing |
| `tray_exist_bits()` / `set_tray_exist_bits()` | Tray existence bitmap | ❌ Missing |
| `tray_read_done_bits()` | Tray RFID read completion | ❌ Missing |

**Calibration (K-value):**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `add_calibration_to_printer()` | Store calibration for filament | ⚠️ Partial (fetches only) |
| `get_matching_printer_calibration_for_extruder()` | Find matching K value | ✅ Implemented |
| `fetch_filament_calibrations()` | Request K values from printer | ✅ Implemented |
| `get_tray_resolved_k_value()` | Get K value with calibration lookup | ✅ Implemented |

**MQTT Message Processing:**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `process_print_message()` | Main entry for all messages | ✅ Implemented |
| `process_print_message__ams()` | Process AMS tray updates | ✅ Implemented |
| `process_print_message__vt_tray()` | Process virtual tray updates | ✅ Implemented |
| `process_print_message__ams_filament_setting()` | Process filament settings | ✅ Implemented |
| `process_print_message__extrusion_cali_sel()` | Process calibration selection | ✅ Implemented |
| `process_print_message__extrusion_cali_get()` | Process calibration retrieval | ✅ Implemented |

**Active Tray Tracking:**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `get_active_extruder()` | Get currently active extruder | ⚠️ Partial |
| `get_tray_active()` | Get current active tray | ✅ Implemented |
| `get_common_tray_active()` | Determine active tray | ✅ Implemented |

**Printer Control:**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `publish_payload()` | Send MQTT command | ✅ Implemented |
| `request_full_update_sync/async()` | Request full printer status | ✅ Implemented |
| `request_version_info_async()` | Request firmware version | ❌ Missing |
| `reset_printer()` | Clear all printer state | ❌ Missing |

**Persistence:**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `load_printer_state()` | Load saved state | ❌ Missing |
| `store_printer_state()` | Save state to storage | ❌ Missing |

### Backend - Store/Database (`core/src/store.rs`, `csvdb.rs`)

| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `get_spool_by_id()` | Retrieve spool by ID | ✅ Implemented |
| `get_spool_by_tag_id()` | Find spool by NFC tag | ✅ Implemented |
| `add_spool()` | Create new spool | ✅ Implemented |
| `update_spool()` | Modify spool | ✅ Implemented |
| `delete_spool()` | Remove spool | ✅ Implemented |
| `list_spools()` | Get all spools | ✅ Implemented |

### Backend - Scale Integration (`core/src/spool_scale.rs`)

| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `on_scale_loaded()` | Scale reads weight | ⏳ Pending (firmware) |
| `on_scale_load_changed_stable()` | Stable weight reading | ⏳ Pending (firmware) |
| `on_scale_load_changed_unstable()` | Unstable reading | ⏳ Pending (firmware) |
| `on_scale_load_removed()` | Filament removed | ⏳ Pending (firmware) |
| `on_scale_connected/disconnected()` | Scale connectivity | ⏳ Pending (firmware) |
| `calibrate()` | Calibrate scale | ⏳ Pending (firmware) |
| `read_tag()` | Trigger NFC read | ⏳ Pending (firmware) |
| `write_tag()` | Write NFC tag | ⏳ Pending (firmware) |
| `erase_tag()` | Clear NFC tag | ⏳ Pending (firmware) |
| `emulate_tag()` | Create virtual tag | ❌ N/A |
| `request_gcode_analysis()` | Request filament usage calc | ❌ Missing |

### Backend - Gcode Analysis (`shared/src/gcode_analysis.rs`)

| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `new()` | Create analyzer | ❌ Missing |
| `set_bbl_info()` | Set Bambu metadata | ❌ Missing |
| `add_buffer()` | Feed gcode chunks | ❌ Missing |
| `process_available_buffer()` | Parse buffered data | ❌ Missing |
| `done()` | Finalize analysis | ❌ Missing |
| `gram_from_length()` | Calculate weight from length | ❌ Missing |
| `fetch_gcode_analysis_task()` | Background analysis task | ❌ Missing |

### Backend - NFC/Tag (`shared/src/nfc.rs`, `spool_tag.rs`, `ndef.rs`)

| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `read_bambulab_payload()` | Read Bambu tag | ✅ Implemented (decoder) |
| `read_ndef_payload()` | Read generic NDEF | ✅ Implemented (decoder) |
| `write_ndef_url_record()` | Write URL to tag | ⏳ Pending (firmware) |
| `erase_ndef_tag()` | Clear tag | ⏳ Pending (firmware) |
| `get_nfc_tag_type()` | Identify tag type | ✅ Implemented |
| `to_tag_descriptor_v2()` | Generate NFC URL encoding | ✅ Implemented |

### Backend - Other Modules

**SSDP Discovery (`ssdp.rs`):**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `ssdp_task()` | Listen for printer announcements | ❌ Missing |

**OTA Updates (`app_ota.rs`):**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `app_ota_task()` | Check/perform firmware updates | ❌ N/A (web app) |

**FTP Client (`my_ftp.rs`):**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `connect()`, `login()`, `retrieve()` | Download files from printer | ❌ Missing |

**Color Utils (`color_utils.rs`):**
| Function | Description | SpoolBuddy Status |
|----------|-------------|-------------------|
| `get_color_name()` | RGB to named color | ❌ Missing |
| `perceptual_distance()` | Color distance calculation | ❌ Missing |

### Feature Status Summary

| Feature | Status | Priority |
|---------|--------|----------|
| **Printer MQTT** | ✅ Full | - |
| **AMS tray management** | ✅ Full | - |
| **K-value calibration** | ✅ Full | - |
| **Spool CRUD** | ✅ SQLite | - |
| **Usage tracking** | ✅ Via AMS remain% | - |
| **Spool-to-slot assignments** | ✅ Persistent | - |
| **Usage history logging** | ✅ Implemented | - |
| **NFC tag read/write** | ⏳ Pending (firmware) | High |
| **Scale integration** | ⏳ Pending (firmware) | High |
| **Gcode analysis** | ❌ Missing | Medium |
| **SSDP printer discovery** | ❌ Missing | Low |
| **Printer state persistence** | ❌ Missing | Low |
| **Multi-extruder support** | ⚠️ Partial | Medium |
| **Locked printer mode** | ❌ Missing | Low |
| **Color name lookup** | ❌ Missing | Low |

### Priority Implementation List

**High Priority (Core Functionality):**
1. NFC tag reading (PN5180 driver in firmware)
2. Scale integration (HX711 driver in firmware)
3. WebSocket device communication

**Medium Priority (Enhanced Features):**
4. Gcode analysis for pre-print filament estimation
5. Multi-extruder support improvements
6. FTP client for printer file access

**Low Priority (Nice to Have):**
7. SSDP printer auto-discovery
8. Printer state persistence across restarts
9. Color name lookup from RGB
10. Locked printer mode handling

---

## Next Steps

**Current:** Phase 3 - Device Firmware

1. Set up ESP32-S3 Rust project with esp-hal
2. Implement WiFi connection
3. Implement PN5180 NFC driver
4. Implement HX711 scale driver
5. WebSocket client to server
6. Basic UI for weight/status display

---

*Document created: December 2024*
*Last updated: December 2024*
