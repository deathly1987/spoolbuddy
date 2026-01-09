/**
 * Simulator Mock Implementations
 * Mock implementations for Rust FFI functions used by firmware UI code
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>

// Include ui_internal.h for type definitions
#include "ui/ui_internal.h"

// =============================================================================
// WiFi Mock Implementation
// =============================================================================

static int mock_wifi_state = 3;  // Start connected
static uint8_t mock_ip[4] = {192, 168, 1, 100};
static int8_t mock_rssi = -45;
static char mock_ssid[33] = "SimulatorNetwork";

int wifi_connect(const char *ssid, const char *password) {
    (void)password;
    printf("[sim_mock] wifi_connect: %s\n", ssid);
    strncpy(mock_ssid, ssid, sizeof(mock_ssid) - 1);
    mock_wifi_state = 3;  // Connected
    return 0;
}

void wifi_get_status(WifiStatus *status) {
    status->state = mock_wifi_state;
    memcpy(status->ip, mock_ip, 4);
    status->rssi = mock_rssi;
}

int wifi_disconnect(void) {
    printf("[sim_mock] wifi_disconnect\n");
    mock_wifi_state = 1;  // Disconnected
    return 0;
}

int wifi_is_connected(void) {
    return mock_wifi_state == 3;
}

int wifi_get_ssid(char *buf, int buf_len) {
    strncpy(buf, mock_ssid, buf_len - 1);
    buf[buf_len - 1] = '\0';
    return strlen(buf);
}

int wifi_scan(WifiScanResult *results, int max_results) {
    if (max_results < 1) return 0;
    strncpy(results[0].ssid, "SimNetwork1", 32);
    results[0].rssi = -45;
    results[0].auth_mode = 3;  // WPA2

    if (max_results < 2) return 1;
    strncpy(results[1].ssid, "SimNetwork2", 32);
    results[1].rssi = -60;
    results[1].auth_mode = 0;  // Open

    return 2;
}

int8_t wifi_get_rssi(void) {
    return mock_rssi;
}

// =============================================================================
// Printer Discovery Mock
// =============================================================================

int printer_discover(PrinterDiscoveryResult *results, int max_results) {
    // Return no local printers - they come from backend
    (void)results;
    (void)max_results;
    return 0;
}

// =============================================================================
// Backend Discovery Mock
// =============================================================================

int backend_discover_server(void) {
    printf("[sim_mock] backend_discover_server (no-op in simulator)\n");
    return 0;
}

// =============================================================================
// OTA Mock Implementation
// =============================================================================

static int mock_ota_state = 0;  // Idle
static int mock_ota_progress = 0;
static bool mock_update_available = false;

int ota_is_update_available(void) {
    return mock_update_available ? 1 : 0;
}

int ota_get_current_version(char *buf, int buf_len) {
    const char *ver = "0.1.1b10";
    strncpy(buf, ver, buf_len - 1);
    buf[buf_len - 1] = '\0';
    return strlen(ver);
}

int ota_get_update_version(char *buf, int buf_len) {
    const char *ver = mock_update_available ? "0.1.2" : "";
    strncpy(buf, ver, buf_len - 1);
    buf[buf_len - 1] = '\0';
    return strlen(ver);
}

int ota_get_state(void) {
    return mock_ota_state;
}

int ota_get_progress(void) {
    return mock_ota_progress;
}

int ota_check_for_update(void) {
    // Simulate check
    mock_ota_state = 1;  // Checking
    return 0;
}

int ota_start_update(void) {
    if (!mock_update_available) return -1;
    mock_ota_state = 2;  // Downloading
    mock_ota_progress = 0;
    return 0;
}

// =============================================================================
// Simulator Control Functions (for testing via keyboard shortcuts, etc.)
// =============================================================================

void sim_set_ota_available(bool available) {
    mock_update_available = available;
}

void sim_set_ota_state(int state) {
    mock_ota_state = state;
}

void sim_set_ota_progress(int progress) {
    mock_ota_progress = progress;
}
