/**
 * ESP-IDF NVS Stub for Simulator
 */
#ifndef NVS_H
#define NVS_H

#include <stdint.h>
#include <stddef.h>

typedef int32_t esp_err_t;
#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_NVS_NOT_FOUND 0x1102

typedef uint32_t nvs_handle_t;
#define NVS_READWRITE 1
#define NVS_READONLY 0

// NVS functions - implemented in sim_mocks.c
esp_err_t nvs_open(const char *namespace, int mode, nvs_handle_t *handle);
esp_err_t nvs_get_blob(nvs_handle_t handle, const char *key, void *out, size_t *len);
esp_err_t nvs_set_blob(nvs_handle_t handle, const char *key, const void *data, size_t len);
esp_err_t nvs_commit(nvs_handle_t handle);
void nvs_close(nvs_handle_t handle);

#endif
