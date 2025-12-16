# SpoolBuddy Cabling Plan

## Hardware Components

| Component | Model | Interface | Purchase Status |
|-----------|-------|-----------|-----------------|
| Main Board | Waveshare ESP32-S3-Touch-LCD-4.3 |
| NFC Reader | PN5180 | SPI | Arriving tomorrow |
| Scale ADC | HX711 | GPIO | TBD |
| Load Cell | 5kg Single-Point | HX711 | TBD |

---

## Wiring Diagram

```
                                    ┌─────────────────────────────────────────┐
                                    │     Waveshare ESP32-S3-Touch-LCD-4.3    │
                                    │                                         │
                                    │   ┌─────────────────────────────────┐   │
                                    │   │                                 │   │
                                    │   │      4.3" Touch Display         │   │
                                    │   │         (800 x 480)             │   │
                                    │   │                                 │   │
                                    │   │      [Built-in - no wiring]     │   │
                                    │   │                                 │   │
                                    │   └─────────────────────────────────┘   │
                                    │                                         │
     PN5180 NFC Module              │   Expansion Header                      │
    ┌──────────────────┐            │   ┌───────────────────┐                 │
    │                  │            │   │                   │                 │
    │   ┌──────────┐   │            │   │  GPIO10 ●─────────┼─────NSS (CS)    │
    │   │PN5180    │   │            │   │  GPIO11 ●─────────┼─────MOSI        │
    │   │  Chip    │   │            │   │  GPIO12 ●─────────┼─────SCLK        │
    │   └──────────┘   │            │   │  GPIO13 ●─────────┼─────MISO        │
    │                  │            │   │  GPIO14 ●─────────┼─────BUSY        │
    │   ┌──────────┐   │            │   │  GPIO21 ●─────────┼─────RST         │
    │   │ Antenna  │   │            │   │                   │                 │
    │   │  Coil    │   │            │   │    3.3V ●─────────┼─────VCC         │
    │   └──────────┘   │            │   │     GND ●─────────┼─────GND         │
    │                  │            │   │                   │                 │
    └──────────────────┘            │   └───────────────────┘                 │
                                    │                                         │
                                    │   ┌───────────────────┐                 │
     HX711 + Load Cell              │   │                   │                 │
    ┌──────────────────┐            │   │   GPIO1 ●─────────┼─────DT (DOUT)   │
    │  ┌────────────┐  │            │   │   GPIO2 ●─────────┼─────SCK         │
    │  │  HX711     │  │            │   │                   │                 │
    │  │  Module    │  │            │   │    3.3V ●─────────┼─────VCC         │
    │  └────────────┘  │            │   │     GND ●─────────┼─────GND         │
    │        │         │            │   │                   │                 │
    │   ┌────┴────┐    │            │   └───────────────────┘                 │
    │   │Load Cell│    │            │                                         │
    │   │(4-wire) │    │            │   USB-C (Power & Debug)                 │
    │   └─────────┘    │            │   ┌───────────────────┐                 │
    │                  │            │   │    ○ USB-C        │                 │
    └──────────────────┘            │   └───────────────────┘                 │
                                    │                                         │
                                    └─────────────────────────────────────────┘
```

---

## Pin Assignments

### PN5180 NFC Reader (SPI)

| PN5180 Pin | ESP32-S3 GPIO | Wire Color (suggested) | Notes |
|------------|---------------|------------------------|-------|
| VCC | 3.3V | Red | 3.3V only! |
| GND | GND | Black | Ground |
| MOSI | GPIO11 | Yellow | SPI Data Out |
| MISO | GPIO13 | Green | SPI Data In |
| SCLK | GPIO12 | Blue | SPI Clock |
| NSS | GPIO10 | Orange | Chip Select (active low) |
| BUSY | GPIO14 | White | Busy indicator |
| RST | GPIO21 | Brown | Reset (active low) |

**SPI Configuration:**
- Mode: SPI Mode 0 (CPOL=0, CPHA=0)
- Speed: 2 MHz (max 10 MHz)
- Bit order: MSB first

### HX711 Scale (GPIO)

| HX711 Pin | ESP32-S3 GPIO | Wire Color (suggested) | Notes |
|-----------|---------------|------------------------|-------|
| VCC | 3.3V | Red | Can use 3.3V or 5V |
| GND | GND | Black | Ground |
| DT (DOUT) | GPIO1 | Green | Data out |
| SCK | GPIO2 | Yellow | Clock |

**HX711 Configuration:**
- Default gain: 128 (Channel A)
- Sample rate: 10 Hz or 80 Hz (set by RATE pin)

### 5kg Load Cell Specifications

| Parameter | Value | Notes |
|-----------|-------|-------|
| Capacity | 5 kg | Perfect for filament spools (typically 1-2kg) |
| Output | 1.0 ± 0.15 mV/V | At full scale |
| Excitation | 3-10V DC | HX711 provides ~4.3V |
| Resolution | ~0.5g | With 24-bit HX711 ADC |
| Overload | 150% (7.5kg) | Safe limit |

**Why 5kg?**
- Full 1kg spool + empty spool (~250g) = ~1.25kg typical max
- Leaves headroom for heavier spools (2kg, 3kg)
- Better resolution than 10kg or 20kg cells
- Common/affordable option

### Load Cell Wiring to HX711

```
   Load Cell (5kg)                    HX711 Module
  ┌─────────────────┐               ┌─────────────────┐
  │                 │               │                 │
  │  Red ───────────┼───────────────┤► E+             │
  │  Black ─────────┼───────────────┤► E-             │
  │  White ─────────┼───────────────┤► A-             │
  │  Green ─────────┼───────────────┤► A+             │
  │                 │               │                 │
  │   ┌─────────┐   │               │  DT ───► GPIO1  │
  │   │ Strain  │   │               │  SCK ──► GPIO2  │
  │   │ Gauge   │   │               │  VCC ──► 3.3V   │
  │   └─────────┘   │               │  GND ──► GND    │
  │                 │               │                 │
  └─────────────────┘               └─────────────────┘
```

| Load Cell Wire | HX711 Terminal | Function |
|----------------|----------------|----------|
| Red | E+ | Excitation + |
| Black | E- | Excitation - |
| White | A- | Signal - |
| Green | A+ | Signal + |

*Note: Wire colors vary by manufacturer. If readings are negative, swap A+ and A-.*

### Load Cell Mounting Options

**Single-Point (Bar Type) - Recommended:**
```
        Fixed End                    Load Platform
     ┌────────────┐                 ┌────────────┐
     │████████████│                 │            │
     │████████████├─────────────────┤            │
     │████████████│   Load Cell     │   Spool    │
     │████████████├─────────────────┤   Here     │
     │████████████│                 │            │
     └────────────┘                 └────────────┘
      Mounting                       Weighing
      Bracket                        Platform
```

**Mounting Notes:**
- Single-point load cells are ideal (one mounting point)
- Ensure load cell is level
- Add 2-3mm clearance below platform for deflection
- Use M4 or M5 screws (check load cell holes)
- Don't overtighten mounting screws

---

## Connection Checklist

### Before Powering On

- [ ] Verify all connections are secure
- [ ] Confirm 3.3V (not 5V) for PN5180
- [ ] Check no shorts between adjacent pins
- [ ] Ensure GND connections are solid

### PN5180 Verification

1. [ ] Connect MOSI → GPIO11
2. [ ] Connect MISO → GPIO13
3. [ ] Connect SCLK → GPIO12
4. [ ] Connect NSS → GPIO10
5. [ ] Connect BUSY → GPIO14
6. [ ] Connect RST → GPIO21
7. [ ] Connect VCC → 3.3V
8. [ ] Connect GND → GND

### HX711 Verification

1. [ ] Connect DT → GPIO1
2. [ ] Connect SCK → GPIO2
3. [ ] Connect VCC → 3.3V (or 5V)
4. [ ] Connect GND → GND
5. [ ] Load cell wired to E+/E-/A+/A-

---

## Physical Assembly Notes

### NFC Antenna Positioning
- Position PN5180 antenna coil **under** the scale platform
- Center the antenna with the spool's core hole
- PN5180 has ~20cm read range (suitable for Bambu Lab tags inside spool core)
- Keep antenna flat and parallel to scale surface

### Scale Platform
- Load cell mounting: 4-corner or single-point depending on load cell type
- Ensure stable, level mounting surface
- Protect load cell from overload (add mechanical stops if needed)
- Shield from drafts for stable readings

### Enclosure Considerations
- Keep PN5180 antenna away from metal (reduces read range)
- Provide access to USB-C for power and debugging
- Allow air circulation if enclosed
- Consider cable strain relief

---

## Waveshare ESP32-S3-Touch-LCD-4.3 Pinout Reference

```
Expansion Connector (directly accessible GPIOs):

         ┌─────────────────────┐
         │  ESP32-S3 LCD 4.3   │
         │                     │
    3V3 ─┤ 1               2  ├─ GND
  GPIO1 ─┤ 3               4  ├─ GPIO2
 GPIO10 ─┤ 5               6  ├─ GPIO11
 GPIO12 ─┤ 7               8  ├─ GPIO13
 GPIO14 ─┤ 9              10  ├─ GPIO21
    ... ─┤                    ├─ ...
         │                     │
         └─────────────────────┘

Note: Actual pinout depends on specific connector.
      Refer to Waveshare wiki for exact positions:
      https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-4.3
```

---

## Power Requirements

| Component | Voltage | Current (typical) | Current (peak) |
|-----------|---------|-------------------|----------------|
| ESP32-S3 + Display | 5V (via USB) | 200mA | 500mA |
| PN5180 | 3.3V | 80mA | 150mA |
| HX711 | 3.3V | 1.5mA | 1.5mA |
| **Total** | **5V USB** | **~300mA** | **~650mA** |

**Recommendation:** Use a quality USB-C cable and 5V/2A power adapter.

---

## USB Serial Access Setup

When connecting via USB for debugging or recovery, you may need to configure serial port permissions.

### Linux (Native Installation)

Run the setup script to install udev rules:

```bash
./scripts/setup-serial-access.sh
```

This will:
1. Install udev rules for automatic permission assignment
2. Add your user to the `dialout` group
3. Require logout/login to take effect

### Docker Installation

The `docker-compose.yml` is pre-configured with serial device access:

```yaml
services:
  spoolbuddy:
    volumes:
      - /dev:/dev
    group_add:
      - dialout
    privileged: true
```

### Manual Fix (Temporary)

If you get "Permission denied" errors:

```bash
sudo chown root:dialout /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

*Note: This resets when the device is unplugged.*

### Persistent Fix (Container Host)

On the host machine running Docker, install the systemd service:

```bash
sudo cp scripts/spoolbuddy-serial.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now spoolbuddy-serial.service
```

---

## Troubleshooting

### PN5180 Not Responding
1. Check SPI wiring (especially MISO/MOSI not swapped)
2. Verify 3.3V power (measure with multimeter)
3. Check RST is pulled high (or toggle it)
4. Reduce SPI speed to 1MHz for testing
5. Check BUSY pin behavior during operations

### HX711 Erratic Readings
1. Check load cell wiring (swap A+/A- if readings inverted)
2. Ensure stable power supply
3. Add decoupling capacitor (100nF) near HX711
4. Shield from electrical noise
5. Allow warm-up time (~1 minute)

### Display Not Working
- Display is built-in; no wiring needed
- If blank: check USB power, try different cable
- If touch not working: check I2C (GT911 touch controller is internal)

---

## Quick Reference Card

```
┌────────────────────────────────────────────────────────────┐
│                 SPOOLBUDDY QUICK WIRING                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  PN5180 (NFC)          HX711 (Scale)     5kg Load Cell     │
│  ───────────           ─────────────     ──────────────    │
│  VCC  → 3.3V           VCC  → 3.3V       Red   → E+        │
│  GND  → GND            GND  → GND        Black → E-        │
│  MOSI → GPIO11         DT   → GPIO1      White → A-        │
│  MISO → GPIO13         SCK  → GPIO2      Green → A+        │
│  SCLK → GPIO12                                             │
│  NSS  → GPIO10                                             │
│  BUSY → GPIO14                                             │
│  RST  → GPIO21                                             │
│                                                            │
│  Power: USB-C 5V/2A                                        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Systemd Service Installation

For production deployments on Linux, install SpoolBuddy as a systemd service:

### Quick Install

```bash
# Build frontend first
cd frontend && npm run build && cd ..

# Install as systemd service
sudo ./scripts/install-systemd.sh production
```

### Manual Installation

1. Copy service files:
```bash
sudo cp scripts/spoolbuddy.service /etc/systemd/system/
sudo cp scripts/spoolbuddy-serial.service /etc/systemd/system/
```

2. Reload and enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable spoolbuddy spoolbuddy-serial
sudo systemctl start spoolbuddy spoolbuddy-serial
```

### Service Management

| Command | Description |
|---------|-------------|
| `sudo systemctl start spoolbuddy` | Start service |
| `sudo systemctl stop spoolbuddy` | Stop service |
| `sudo systemctl restart spoolbuddy` | Restart service |
| `sudo systemctl status spoolbuddy` | Check status |
| `sudo journalctl -u spoolbuddy -f` | View logs (follow) |

### Uninstall

```bash
sudo ./scripts/uninstall-systemd.sh
```

---

## Next Steps After Wiring

1. **Flash firmware**: See `firmware/README.md`
2. **Test NFC**: Place tag on antenna, check serial output
3. **Calibrate scale**: Use known weight, run calibration
4. **Connect to server**: Configure WiFi, verify WebSocket connection
5. **Test full flow**: Read tag → update UI → log weight
