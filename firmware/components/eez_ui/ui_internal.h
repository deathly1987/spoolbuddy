#ifndef UI_INTERNAL_H
#define UI_INTERNAL_H

#include <lvgl/lvgl.h>
#include "screens.h"

#ifdef __cplusplus
extern "C" {
#endif

// =============================================================================
// Shared Type Definitions
// =============================================================================

// WiFi status from Rust
typedef struct {
    int state;       // 0=Uninitialized, 1=Disconnected, 2=Connecting, 3=Connected, 4=Error
    uint8_t ip[4];   // IP address when connected
    int8_t rssi;     // Signal strength in dBm (when connected)
} WifiStatus;

// WiFi scan result from Rust
typedef struct {
    char ssid[33];   // SSID (null-terminated)
    int8_t rssi;     // Signal strength in dBm
    uint8_t auth_mode; // 0=Open, 1=WEP, 2=WPA, 3=WPA2, 4=WPA3
} WifiScanResult;

// Printer discovery result from Rust
typedef struct {
    char name[64];      // Printer name (null-terminated)
    char serial[32];    // Serial number (null-terminated)
    char ip[16];        // IP address as string (null-terminated)
    char model[32];     // Model name (null-terminated)
} PrinterDiscoveryResult;

// Saved printer configuration
#define MAX_PRINTERS 8

typedef struct {
    char name[32];
    char serial[20];
    char access_code[12];
    char ip_address[16];
    int mqtt_state;  // 0=Disconnected, 1=Connecting, 2=Connected
} SavedPrinter;

// =============================================================================
// Extern Functions (implemented in Rust)
// =============================================================================

// WiFi functions
extern int wifi_connect(const char *ssid, const char *password);
extern void wifi_get_status(WifiStatus *status);
extern int wifi_disconnect(void);
extern int wifi_is_connected(void);
extern int wifi_get_ssid(char *buf, int buf_len);
extern int wifi_scan(WifiScanResult *results, int max_results);
extern int8_t wifi_get_rssi(void);

// Printer discovery
extern int printer_discover(PrinterDiscoveryResult *results, int max_results);

// =============================================================================
// Shared Global Variables (defined in ui_core.c)
// =============================================================================

extern int16_t currentScreen;
extern enum ScreensEnum pendingScreen;
extern enum ScreensEnum previousScreen;
extern const char *pending_settings_detail_title;
extern int pending_settings_tab;

// =============================================================================
// Shared Printer State (defined in ui_printer.c)
// =============================================================================

extern SavedPrinter saved_printers[MAX_PRINTERS];
extern int saved_printer_count;
extern int editing_printer_index;

// =============================================================================
// Module Functions - ui_core.c
// =============================================================================

void loadScreen(enum ScreensEnum screenId);
void navigate_to_settings_detail(const char *title);
void delete_all_screens(void);

// =============================================================================
// Module Functions - ui_nvs.c
// =============================================================================

void save_printers_to_nvs(void);
void load_printers_from_nvs(void);

// =============================================================================
// Module Functions - ui_wifi.c
// =============================================================================

void wire_wifi_settings_buttons(void);
void update_wifi_ui_state(void);
void update_wifi_connect_btn_state(void);
void ui_wifi_cleanup(void);

// =============================================================================
// Module Functions - ui_printer.c
// =============================================================================

void wire_printer_add_buttons(void);
void wire_printer_edit_buttons(void);
void wire_printers_tab(void);
void update_printers_list(void);
void update_printer_edit_ui(void);
void ui_printer_cleanup(void);

// =============================================================================
// Module Functions - ui_settings.c
// =============================================================================

void wire_settings_buttons(void);
void wire_settings_detail_buttons(void);
void wire_settings_subpage_buttons(lv_obj_t *back_btn);
void select_settings_tab(int tab_index);
void update_settings_detail_title(void);

// =============================================================================
// Module Functions - ui_scale.c
// =============================================================================

void wire_scale_buttons(void);
void update_scale_ui(void);

// =============================================================================
// Module Functions - ui_core.c (wiring)
// =============================================================================

void wire_main_buttons(void);
void wire_ams_overview_buttons(void);
void wire_scan_result_buttons(void);
void wire_spool_details_buttons(void);

#ifdef __cplusplus
}
#endif

#endif // UI_INTERNAL_H
