/**
 * ESP-IDF NVS Flash Stub for Simulator
 */
#ifndef NVS_FLASH_H
#define NVS_FLASH_H

#include "nvs.h"

// Not needed for simulator - NVS is always ready
static inline esp_err_t nvs_flash_init(void) { return ESP_OK; }

#endif
