// =============================================================================
// ui_scale.c - Scale Settings Screen Handlers
// =============================================================================
// NOTE: Scale screen has been removed from the new EEZ design.
// These functions are stubbed out for compatibility.
// =============================================================================

#include "ui_internal.h"
#include "screens.h"
#include <stdio.h>

// =============================================================================
// Scale Functions (Rust FFI on ESP32, stubs on simulator)
// =============================================================================

#ifdef ESP_PLATFORM
// ESP32: External Rust FFI functions (from scale_manager.rs)
extern float scale_get_weight(void);
extern int32_t scale_get_raw(void);
extern bool scale_is_initialized(void);
extern bool scale_is_stable(void);
extern int32_t scale_tare(void);
extern int32_t scale_calibrate(float known_weight_grams);
extern int32_t scale_get_tare_offset(void);
#else
// Simulator: Mock scale functions
static float mock_weight = 0.0f;
static int32_t mock_raw = 0;
static int32_t mock_tare_offset = 0;

float scale_get_weight(void) { return mock_weight; }
int32_t scale_get_raw(void) { return mock_raw; }
bool scale_is_initialized(void) { return false; }  // No scale in simulator
bool scale_is_stable(void) { return false; }
int32_t scale_tare(void) { mock_tare_offset = mock_raw; return 0; }
int32_t scale_calibrate(float known_weight_grams) { (void)known_weight_grams; return 0; }
int32_t scale_get_tare_offset(void) { return mock_tare_offset; }
#endif

// =============================================================================
// UI Update Functions (stubbed - no scale screen in new design)
// =============================================================================

void update_scale_ui(void) {
    // No scale screen in new EEZ design - nothing to update
}

// =============================================================================
// Wire Functions (stubbed - no scale screen in new design)
// =============================================================================

void wire_scale_buttons(void) {
    // No scale screen in new EEZ design - nothing to wire
}
