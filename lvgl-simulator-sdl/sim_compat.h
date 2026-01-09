/**
 * Simulator Compatibility Header
 * Provides ESP32-compatible macros and mock functions for desktop simulation
 */

#ifndef SIM_COMPAT_H
#define SIM_COMPAT_H

#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

// =============================================================================
// ESP-IDF Log Macros
// =============================================================================

#define ESP_LOGI(tag, fmt, ...) printf("[%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGE(tag, fmt, ...) printf("[ERROR][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGW(tag, fmt, ...) printf("[WARN][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGD(tag, fmt, ...) printf("[DEBUG][%s] " fmt "\n", tag, ##__VA_ARGS__)

// =============================================================================
// NVS Mock (Non-Volatile Storage)
// =============================================================================

typedef int32_t esp_err_t;
#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_NVS_NOT_FOUND 0x1102

typedef uint32_t nvs_handle_t;
#define NVS_READWRITE 1
#define NVS_READONLY 0

// NVS mock functions - implemented in sim_mocks.c
esp_err_t nvs_open(const char *namespace, int mode, nvs_handle_t *handle);
esp_err_t nvs_get_blob(nvs_handle_t handle, const char *key, void *out, size_t *len);
esp_err_t nvs_set_blob(nvs_handle_t handle, const char *key, const void *data, size_t len);
esp_err_t nvs_commit(nvs_handle_t handle);
void nvs_close(nvs_handle_t handle);

// =============================================================================
// WiFi Mock Functions
// =============================================================================

typedef struct {
    int state;       // 0=Uninitialized, 1=Disconnected, 2=Connecting, 3=Connected, 4=Error
    uint8_t ip[4];
    int8_t rssi;
} WifiStatus;

typedef struct {
    char ssid[33];
    int8_t rssi;
    uint8_t auth_mode;
} WifiScanResult;

int wifi_connect(const char *ssid, const char *password);
void wifi_get_status(WifiStatus *status);
int wifi_disconnect(void);
int wifi_is_connected(void);
int wifi_get_ssid(char *buf, int buf_len);
int wifi_scan(WifiScanResult *results, int max_results);
int8_t wifi_get_rssi(void);

// =============================================================================
// Printer Discovery Mock
// =============================================================================

typedef struct {
    char name[64];
    char serial[32];
    char ip[16];
    char model[32];
} PrinterDiscoveryResult;

int printer_discover(PrinterDiscoveryResult *results, int max_results);

// =============================================================================
// OTA Mock Functions
// =============================================================================

int ota_is_update_available(void);
int ota_get_current_version(char *buf, int buf_len);
int ota_get_update_version(char *buf, int buf_len);
int ota_get_state(void);
int ota_get_progress(void);
int ota_check_for_update(void);
int ota_start_update(void);

// =============================================================================
// Backend Discover Mock
// =============================================================================

int backend_discover_server(void);

#endif // SIM_COMPAT_H
