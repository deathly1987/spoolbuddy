// =============================================================================
// ui_scale.c - Scale Settings Screen Handlers
// =============================================================================
// Handles scale UI updates, tare, and calibration buttons.
// =============================================================================

#include "ui_internal.h"
#include "screens.h"
#include <stdio.h>

// =============================================================================
// External Rust FFI functions (from scale_manager.rs)
// =============================================================================

extern float scale_get_weight(void);
extern int32_t scale_get_raw(void);
extern bool scale_is_initialized(void);
extern bool scale_is_stable(void);
extern int32_t scale_tare(void);
extern int32_t scale_calibrate(float known_weight_grams);
extern int32_t scale_get_tare_offset(void);

// =============================================================================
// Button Handlers
// =============================================================================

static void scale_tare_click_handler(lv_event_t *e) {
    // Call Rust tare function
    int32_t result = scale_tare();

    // Update tare offset display
    if (objects.scale_tare) {
        char buf[64];
        snprintf(buf, sizeof(buf), "Tare Offset: %ld", (long)scale_get_tare_offset());
        lv_label_set_text(objects.scale_tare, buf);
    }

    // Show feedback
    if (objects.scale_status) {
        if (result == 0) {
            lv_label_set_text(objects.scale_status, "Status: Tared!");
        } else {
            lv_label_set_text(objects.scale_status, "Status: Tare failed");
        }
    }
}

static void scale_calibrate_click_handler(lv_event_t *e) {
    // TODO: Show calibration dialog to enter known weight
    // For now, calibrate with 100g
    int32_t result = scale_calibrate(100.0f);

    if (objects.scale_status) {
        if (result == 0) {
            lv_label_set_text(objects.scale_status, "Status: Calibrated (100g)");
        } else {
            lv_label_set_text(objects.scale_status, "Status: Calibration failed");
        }
    }
}

// =============================================================================
// UI Update Functions
// =============================================================================

void update_scale_ui(void) {
    // Update status
    if (objects.scale_status) {
        bool initialized = scale_is_initialized();
        bool stable = scale_is_stable();

        if (!initialized) {
            lv_label_set_text(objects.scale_status, "Status: Not connected");
            lv_obj_set_style_text_color(objects.scale_status, lv_color_hex(0xffff5555), LV_PART_MAIN);
        } else if (stable) {
            lv_label_set_text(objects.scale_status, "Status: Stable");
            lv_obj_set_style_text_color(objects.scale_status, lv_color_hex(0xff00ff00), LV_PART_MAIN);
        } else {
            lv_label_set_text(objects.scale_status, "Status: Reading...");
            lv_obj_set_style_text_color(objects.scale_status, lv_color_hex(0xffffaa00), LV_PART_MAIN);
        }
    }

    // Update weight reading
    if (objects.scale_reading) {
        float weight = scale_get_weight();
        int32_t raw = scale_get_raw();
        char buf[64];
        snprintf(buf, sizeof(buf), "Weight: %.1fg  (raw: %ld)", weight, (long)raw);
        lv_label_set_text(objects.scale_reading, buf);
    }

    // Update tare offset
    if (objects.scale_tare) {
        char buf[64];
        snprintf(buf, sizeof(buf), "Tare Offset: %ld", (long)scale_get_tare_offset());
        lv_label_set_text(objects.scale_tare, buf);
    }
}

// =============================================================================
// Wire Functions
// =============================================================================

void wire_scale_buttons(void) {
    // Tare button
    if (objects.scale_tare_btn) {
        lv_obj_add_flag(objects.scale_tare_btn, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_remove_flag(objects.scale_tare_btn, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
        lv_obj_add_event_cb(objects.scale_tare_btn, scale_tare_click_handler, LV_EVENT_CLICKED, NULL);
    }

    // Calibrate button
    if (objects.scale_calibrate_btn) {
        lv_obj_add_flag(objects.scale_calibrate_btn, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_remove_flag(objects.scale_calibrate_btn, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
        lv_obj_add_event_cb(objects.scale_calibrate_btn, scale_calibrate_click_handler, LV_EVENT_CLICKED, NULL);
    }

    // Initial UI update
    update_scale_ui();
}
