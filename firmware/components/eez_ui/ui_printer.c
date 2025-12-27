// =============================================================================
// ui_printer.c - Printer Management Handlers
// =============================================================================
// Handles printer discovery, add/edit/delete, and printer list UI.
// =============================================================================

#include "ui_internal.h"
#include "screens.h"
#include "images.h"
#include "esp_log.h"
#include <stdio.h>
#include <string.h>

static const char *TAG = "ui_printer";

// =============================================================================
// Module State (shared via ui_internal.h)
// =============================================================================

SavedPrinter saved_printers[MAX_PRINTERS];
int saved_printer_count = 0;
int editing_printer_index = -1;  // -1 = adding new, >= 0 = editing

// =============================================================================
// Internal State
// =============================================================================

// Original values for change detection in edit screen
static char original_printer_name[64] = "";
static char original_printer_serial[32] = "";
static char original_printer_ip[32] = "";
static char original_printer_code[32] = "";

static lv_obj_t *printer_keyboard = NULL;
static lv_obj_t *printer_focused_ta = NULL;
static lv_obj_t *printer_scan_list = NULL;
static lv_obj_t *printer_moved_form = NULL;
static int printer_form_original_y = -1;
static lv_obj_t *delete_confirm_modal = NULL;
static lv_obj_t *dynamic_printer_rows[MAX_PRINTERS] = {NULL};

// Static storage for discovery results
static PrinterDiscoveryResult printer_discovery_results[8];
static int printer_discovery_count = 0;

// =============================================================================
// Forward Declarations
// =============================================================================

static void printer_row_click_handler(lv_event_t *e);

// =============================================================================
// Keyboard Helpers
// =============================================================================

static void printer_hide_keyboard(void) {
    if (printer_keyboard) {
        lv_obj_add_flag(printer_keyboard, LV_OBJ_FLAG_HIDDEN);
    }
    if (printer_moved_form && printer_form_original_y >= 0) {
        lv_obj_set_y(printer_moved_form, printer_form_original_y);
        printer_moved_form = NULL;
        printer_form_original_y = -1;
    }
    printer_focused_ta = NULL;
}

static void printer_keyboard_event_cb(lv_event_t *e) {
    lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_READY || code == LV_EVENT_CANCEL) {
        printer_hide_keyboard();
    }
}

static void ensure_printer_keyboard(void) {
    if (printer_keyboard) return;
    if (!objects.settings_printer_add) return;

    printer_keyboard = lv_keyboard_create(objects.settings_printer_add);
    if (!printer_keyboard) return;

    lv_obj_set_size(printer_keyboard, 800, 220);
    lv_obj_align(printer_keyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_add_flag(printer_keyboard, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_event_cb(printer_keyboard, printer_keyboard_event_cb, LV_EVENT_ALL, NULL);
}

// =============================================================================
// Printer Add Screen Handlers
// =============================================================================

static void printer_textarea_click_handler(lv_event_t *e) {
    lv_obj_t *ta = lv_event_get_target(e);
    if (!ta) return;

    ensure_printer_keyboard();

    if (printer_keyboard) {
        printer_focused_ta = ta;
        lv_keyboard_set_textarea(printer_keyboard, ta);
        lv_obj_remove_flag(printer_keyboard, LV_OBJ_FLAG_HIDDEN);

        // Move form up to show textarea above keyboard
        if (objects.settings_printer_add_2) {
            if (printer_form_original_y < 0) {
                printer_form_original_y = lv_obj_get_y(objects.settings_printer_add_2);
                printer_moved_form = objects.settings_printer_add_2;
            }
            int32_t ta_y = lv_obj_get_y(ta);
            if (ta_y > 120) {
                int32_t offset = ta_y - 80;
                lv_obj_set_y(objects.settings_printer_add_2, printer_form_original_y - offset);
            }
        }
    }
}

static void printer_scan_list_btn_handler(lv_event_t *e) {
    // Close the scan list
    if (printer_scan_list) {
        lv_obj_delete(printer_scan_list);
        printer_scan_list = NULL;
    }
}

// Handler for clicking on a discovered printer row
static void discovered_printer_click_handler(lv_event_t *e) {
    int index = (int)(intptr_t)lv_event_get_user_data(e);
    if (index < 0 || index >= printer_discovery_count) return;

    PrinterDiscoveryResult *printer = &printer_discovery_results[index];

    // Close popup
    if (printer_scan_list) {
        lv_obj_delete(printer_scan_list);
        printer_scan_list = NULL;
    }

    // Fill in the form fields with discovered printer info
    if (objects.printer_name_input) {
        lv_textarea_set_text(objects.printer_name_input, printer->name);
    }
    if (objects.printer_serial_input) {
        lv_textarea_set_text(objects.printer_serial_input, printer->serial);
    }
    if (objects.printer_ip_input) {
        lv_textarea_set_text(objects.printer_ip_input, printer->ip);
    }
    // Leave access code empty - user needs to enter it
}

static void printer_scan_click_handler(lv_event_t *e) {
    printer_hide_keyboard();

    // Close existing scan list if open
    if (printer_scan_list) {
        lv_obj_delete(printer_scan_list);
        printer_scan_list = NULL;
    }

    // Create popup on the screen
    lv_obj_t *screen = lv_screen_active();
    if (!screen) return;

    // Check if WiFi is connected
    WifiStatus wifi_status;
    wifi_get_status(&wifi_status);

    if (wifi_status.state != 3) {
        // Not connected - show error popup
        printer_scan_list = lv_obj_create(screen);
        lv_obj_set_size(printer_scan_list, 420, 180);
        lv_obj_center(printer_scan_list);
        lv_obj_move_foreground(printer_scan_list);
        lv_obj_set_style_bg_color(printer_scan_list, lv_color_hex(0xff1a1a1a), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(printer_scan_list, 255, LV_PART_MAIN);
        lv_obj_set_style_border_color(printer_scan_list, lv_color_hex(0xffff5555), LV_PART_MAIN);
        lv_obj_set_style_border_width(printer_scan_list, 2, LV_PART_MAIN);
        lv_obj_set_style_radius(printer_scan_list, 12, LV_PART_MAIN);
        lv_obj_set_style_pad_all(printer_scan_list, 20, LV_PART_MAIN);
        lv_obj_set_style_shadow_color(printer_scan_list, lv_color_hex(0xff000000), LV_PART_MAIN);
        lv_obj_set_style_shadow_opa(printer_scan_list, 200, LV_PART_MAIN);
        lv_obj_set_style_shadow_width(printer_scan_list, 30, LV_PART_MAIN);
        lv_obj_set_flex_flow(printer_scan_list, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(printer_scan_list, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_pad_row(printer_scan_list, 15, LV_PART_MAIN);

        lv_obj_t *title = lv_label_create(printer_scan_list);
        lv_label_set_text(title, "WiFi Required");
        lv_obj_set_style_text_color(title, lv_color_hex(0xffff5555), LV_PART_MAIN);
        lv_obj_set_style_text_font(title, &lv_font_montserrat_18, LV_PART_MAIN);

        lv_obj_t *msg = lv_label_create(printer_scan_list);
        lv_label_set_text(msg, "Please connect to WiFi first\nto discover printers on your network.");
        lv_obj_set_style_text_color(msg, lv_color_hex(0xffaaaaaa), LV_PART_MAIN);
        lv_obj_set_style_text_align(msg, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);

        lv_obj_t *close_btn = lv_button_create(printer_scan_list);
        lv_obj_set_size(close_btn, 120, 36);
        lv_obj_set_style_bg_color(close_btn, lv_color_hex(0xff444444), LV_PART_MAIN);
        lv_obj_set_style_radius(close_btn, 6, LV_PART_MAIN);
        lv_obj_add_event_cb(close_btn, printer_scan_list_btn_handler, LV_EVENT_CLICKED, NULL);
        lv_obj_t *close_label = lv_label_create(close_btn);
        lv_label_set_text(close_label, "OK");
        lv_obj_set_style_text_color(close_label, lv_color_hex(0xffffffff), LV_PART_MAIN);
        lv_obj_center(close_label);
        return;
    }

    // Show scanning popup
    printer_scan_list = lv_obj_create(screen);
    lv_obj_set_size(printer_scan_list, 420, 150);
    lv_obj_center(printer_scan_list);
    lv_obj_move_foreground(printer_scan_list);
    lv_obj_set_style_bg_color(printer_scan_list, lv_color_hex(0xff1a1a1a), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(printer_scan_list, 255, LV_PART_MAIN);
    lv_obj_set_style_border_color(printer_scan_list, lv_color_hex(0xff00ff00), LV_PART_MAIN);
    lv_obj_set_style_border_width(printer_scan_list, 2, LV_PART_MAIN);
    lv_obj_set_style_radius(printer_scan_list, 12, LV_PART_MAIN);
    lv_obj_set_style_pad_all(printer_scan_list, 20, LV_PART_MAIN);
    lv_obj_set_flex_flow(printer_scan_list, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(printer_scan_list, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(printer_scan_list, 15, LV_PART_MAIN);

    lv_obj_t *title = lv_label_create(printer_scan_list);
    lv_label_set_text(title, "Discovering Printers...");
    lv_obj_set_style_text_color(title, lv_color_hex(0xff00ff00), LV_PART_MAIN);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_18, LV_PART_MAIN);

    lv_obj_t *spinner = lv_spinner_create(printer_scan_list);
    lv_obj_set_size(spinner, 40, 40);
    lv_spinner_set_anim_params(spinner, 1000, 200);
    lv_obj_set_style_arc_color(spinner, lv_color_hex(0xff00ff00), LV_PART_INDICATOR);
    lv_obj_set_style_arc_color(spinner, lv_color_hex(0xff333333), LV_PART_MAIN);

    // Force display update before blocking discovery call
    lv_refr_now(NULL);

    // Perform discovery (blocking - waits for responses)
    printer_discovery_count = printer_discover(printer_discovery_results, 8);
    if (printer_discovery_count < 0) printer_discovery_count = 0;

    // Delete scanning popup and show results
    lv_obj_delete(printer_scan_list);
    printer_scan_list = NULL;

    // Create results popup
    printer_scan_list = lv_obj_create(screen);
    int popup_height = (printer_discovery_count == 0) ? 180 : (130 + printer_discovery_count * 68);
    if (popup_height > 420) popup_height = 420;
    lv_obj_set_size(printer_scan_list, 450, popup_height);
    lv_obj_center(printer_scan_list);
    lv_obj_move_foreground(printer_scan_list);
    lv_obj_set_style_bg_color(printer_scan_list, lv_color_hex(0xff1a1a1a), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(printer_scan_list, 255, LV_PART_MAIN);
    lv_obj_set_style_border_color(printer_scan_list, printer_discovery_count > 0 ? lv_color_hex(0xff00ff00) : lv_color_hex(0xffffaa00), LV_PART_MAIN);
    lv_obj_set_style_border_width(printer_scan_list, 2, LV_PART_MAIN);
    lv_obj_set_style_radius(printer_scan_list, 12, LV_PART_MAIN);
    lv_obj_set_style_pad_all(printer_scan_list, 15, LV_PART_MAIN);
    lv_obj_set_style_shadow_color(printer_scan_list, lv_color_hex(0xff000000), LV_PART_MAIN);
    lv_obj_set_style_shadow_opa(printer_scan_list, 200, LV_PART_MAIN);
    lv_obj_set_style_shadow_width(printer_scan_list, 30, LV_PART_MAIN);
    lv_obj_set_flex_flow(printer_scan_list, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(printer_scan_list, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(printer_scan_list, 10, LV_PART_MAIN);

    // Title
    title = lv_label_create(printer_scan_list);
    if (printer_discovery_count == 0) {
        lv_label_set_text(title, "No Printers Found");
        lv_obj_set_style_text_color(title, lv_color_hex(0xffffaa00), LV_PART_MAIN);
    } else {
        char title_buf[32];
        snprintf(title_buf, sizeof(title_buf), "Found %d Printer%s", printer_discovery_count, printer_discovery_count == 1 ? "" : "s");
        lv_label_set_text(title, title_buf);
        lv_obj_set_style_text_color(title, lv_color_hex(0xff00ff00), LV_PART_MAIN);
    }
    lv_obj_set_style_text_font(title, &lv_font_montserrat_16, LV_PART_MAIN);

    if (printer_discovery_count == 0) {
        // No printers found message
        lv_obj_t *msg = lv_label_create(printer_scan_list);
        lv_label_set_text(msg, "No Bambu printers were found\non your network.\n\nMake sure your printer is\npowered on and connected to WiFi.");
        lv_obj_set_style_text_color(msg, lv_color_hex(0xffaaaaaa), LV_PART_MAIN);
        lv_obj_set_style_text_align(msg, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    } else {
        // Create scrollable list of printers
        lv_obj_t *list_container = lv_obj_create(printer_scan_list);
        lv_obj_set_size(list_container, 410, printer_discovery_count * 68);
        lv_obj_set_style_bg_opa(list_container, 0, LV_PART_MAIN);
        lv_obj_set_style_border_width(list_container, 0, LV_PART_MAIN);
        lv_obj_set_style_pad_all(list_container, 0, LV_PART_MAIN);
        lv_obj_set_flex_flow(list_container, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_style_pad_row(list_container, 8, LV_PART_MAIN);

        for (int i = 0; i < printer_discovery_count; i++) {
            PrinterDiscoveryResult *printer = &printer_discovery_results[i];

            lv_obj_t *row = lv_obj_create(list_container);
            lv_obj_set_size(row, 400, 60);
            lv_obj_set_style_bg_color(row, lv_color_hex(0xff2d2d2d), LV_PART_MAIN);
            lv_obj_set_style_bg_opa(row, 255, LV_PART_MAIN);
            lv_obj_set_style_radius(row, 8, LV_PART_MAIN);
            lv_obj_set_style_border_width(row, 0, LV_PART_MAIN);
            lv_obj_set_style_pad_all(row, 8, LV_PART_MAIN);
            lv_obj_add_flag(row, LV_OBJ_FLAG_CLICKABLE);
            lv_obj_set_style_bg_color(row, lv_color_hex(0xff3d3d3d), LV_PART_MAIN | LV_STATE_PRESSED);
            lv_obj_add_event_cb(row, discovered_printer_click_handler, LV_EVENT_CLICKED, (void*)(intptr_t)i);

            // Line 1: Printer name (bold white)
            lv_obj_t *name_label = lv_label_create(row);
            lv_label_set_text(name_label, printer->name);
            lv_obj_set_style_text_color(name_label, lv_color_hex(0xffffffff), LV_PART_MAIN);
            lv_obj_set_style_text_font(name_label, &lv_font_montserrat_14, LV_PART_MAIN);
            lv_obj_set_pos(name_label, 5, 2);

            // Line 2: Model (green)
            lv_obj_t *model_label = lv_label_create(row);
            lv_label_set_text(model_label, printer->model);
            lv_obj_set_style_text_color(model_label, lv_color_hex(0xff00ff00), LV_PART_MAIN);
            lv_obj_set_style_text_font(model_label, &lv_font_montserrat_12, LV_PART_MAIN);
            lv_obj_set_pos(model_label, 5, 20);

            // Line 3: Serial • IP (gray)
            char info_buf[80];
            if (printer->serial[0] != '\0') {
                snprintf(info_buf, sizeof(info_buf), "SN: %s  IP: %s", printer->serial, printer->ip);
            } else {
                snprintf(info_buf, sizeof(info_buf), "IP: %s", printer->ip);
            }
            lv_obj_t *info_label = lv_label_create(row);
            lv_label_set_text(info_label, info_buf);
            lv_obj_set_style_text_color(info_label, lv_color_hex(0xff888888), LV_PART_MAIN);
            lv_obj_set_style_text_font(info_label, &lv_font_montserrat_10, LV_PART_MAIN);
            lv_obj_set_pos(info_label, 5, 36);

            // Chevron
            lv_obj_t *chevron = lv_label_create(row);
            lv_label_set_text(chevron, ">");
            lv_obj_set_style_text_color(chevron, lv_color_hex(0xff666666), LV_PART_MAIN);
            lv_obj_align(chevron, LV_ALIGN_RIGHT_MID, -5, 0);
        }
    }

    // Close button
    lv_obj_t *close_btn = lv_button_create(printer_scan_list);
    lv_obj_set_size(close_btn, 120, 36);
    lv_obj_set_style_bg_color(close_btn, lv_color_hex(0xff444444), LV_PART_MAIN);
    lv_obj_set_style_radius(close_btn, 6, LV_PART_MAIN);
    lv_obj_add_event_cb(close_btn, printer_scan_list_btn_handler, LV_EVENT_CLICKED, NULL);
    lv_obj_t *close_label = lv_label_create(close_btn);
    lv_label_set_text(close_label, "Close");
    lv_obj_set_style_text_color(close_label, lv_color_hex(0xffffffff), LV_PART_MAIN);
    lv_obj_center(close_label);
}

static void printer_add_click_handler(lv_event_t *e) {
    printer_hide_keyboard();

    if (printer_scan_list) {
        lv_obj_delete(printer_scan_list);
        printer_scan_list = NULL;
    }

    const char *name = "";
    const char *serial = "";
    const char *code = "";
    const char *ip = "";

    if (objects.printer_name_input) {
        name = lv_textarea_get_text(objects.printer_name_input);
    }
    if (objects.printer_serial_input) {
        serial = lv_textarea_get_text(objects.printer_serial_input);
    }
    if (objects.printer_ip_input) {
        ip = lv_textarea_get_text(objects.printer_ip_input);
    }
    if (objects.printer_code_input) {
        code = lv_textarea_get_text(objects.printer_code_input);
    }

    // Validate
    if (!name || strlen(name) == 0 || !serial || strlen(serial) == 0) {
        return;
    }

    if (saved_printer_count < MAX_PRINTERS) {
        strncpy(saved_printers[saved_printer_count].name, name, sizeof(saved_printers[0].name) - 1);
        strncpy(saved_printers[saved_printer_count].serial, serial, sizeof(saved_printers[0].serial) - 1);
        strncpy(saved_printers[saved_printer_count].ip_address, ip ? ip : "", sizeof(saved_printers[0].ip_address) - 1);
        strncpy(saved_printers[saved_printer_count].access_code, code ? code : "", sizeof(saved_printers[0].access_code) - 1);
        saved_printers[saved_printer_count].mqtt_state = 0;
        saved_printer_count++;
        save_printers_to_nvs();
    }

    pending_settings_tab = 1;
    pendingScreen = SCREEN_ID_SETTINGS;
}

void wire_printer_add_buttons(void) {
    if (!objects.settings_printer_add) return;

    // Reset module state when screen is created
    printer_keyboard = NULL;
    printer_focused_ta = NULL;
    printer_moved_form = NULL;
    printer_form_original_y = -1;

    if (objects.printer_name_input) {
        lv_obj_add_flag(objects.printer_name_input, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(objects.printer_name_input, printer_textarea_click_handler, LV_EVENT_CLICKED, NULL);
    }
    if (objects.printer_serial_input) {
        lv_obj_add_flag(objects.printer_serial_input, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(objects.printer_serial_input, printer_textarea_click_handler, LV_EVENT_CLICKED, NULL);
    }
    if (objects.printer_ip_input) {
        lv_obj_add_flag(objects.printer_ip_input, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(objects.printer_ip_input, printer_textarea_click_handler, LV_EVENT_CLICKED, NULL);
    }
    if (objects.printer_code_input) {
        lv_obj_add_flag(objects.printer_code_input, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(objects.printer_code_input, printer_textarea_click_handler, LV_EVENT_CLICKED, NULL);
        lv_textarea_set_password_mode(objects.printer_code_input, true);
    }
    if (objects.printer_add_btn) {
        lv_obj_add_event_cb(objects.printer_add_btn, printer_add_click_handler, LV_EVENT_CLICKED, NULL);
    }
    if (objects.printer_scan_btn) {
        lv_obj_add_flag(objects.printer_scan_btn, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(objects.printer_scan_btn, printer_scan_click_handler, LV_EVENT_CLICKED, NULL);
    }
}

// =============================================================================
// Printer Edit Screen Handlers
// =============================================================================

static void printer_edit_textarea_click_handler(lv_event_t *e) {
    lv_obj_t *ta = lv_event_get_target(e);
    if (!ta) return;

    if (!printer_keyboard && objects.settings_printer_edit) {
        printer_keyboard = lv_keyboard_create(objects.settings_printer_edit);
        if (printer_keyboard) {
            lv_obj_set_size(printer_keyboard, 800, 220);
            lv_obj_align(printer_keyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
            lv_obj_add_flag(printer_keyboard, LV_OBJ_FLAG_HIDDEN);
            lv_obj_add_event_cb(printer_keyboard, printer_keyboard_event_cb, LV_EVENT_ALL, NULL);
        }
    }

    if (printer_keyboard) {
        printer_focused_ta = ta;
        lv_keyboard_set_textarea(printer_keyboard, ta);
        lv_obj_remove_flag(printer_keyboard, LV_OBJ_FLAG_HIDDEN);

        if (objects.settings_printer_add_3) {
            if (printer_form_original_y < 0) {
                printer_form_original_y = lv_obj_get_y(objects.settings_printer_add_3);
                printer_moved_form = objects.settings_printer_add_3;
            }
            int32_t ta_y = lv_obj_get_y(ta);
            if (ta_y > 120) {
                int32_t offset = ta_y - 80;
                lv_obj_set_y(objects.settings_printer_add_3, printer_form_original_y - offset);
            }
        }
    }
}

static void printer_save_click_handler(lv_event_t *e) {
    printer_hide_keyboard();

    if (editing_printer_index < 0 || editing_printer_index >= saved_printer_count) {
        pendingScreen = SCREEN_ID_SETTINGS;
        return;
    }

    const char *name = "";
    const char *serial = "";
    const char *code = "";
    const char *ip = "";

    if (objects.printer_name_input_1) {
        name = lv_textarea_get_text(objects.printer_name_input_1);
    }
    if (objects.printer_serial_input_1) {
        serial = lv_textarea_get_text(objects.printer_serial_input_1);
    }
    if (objects.printer_ip_input_1) {
        ip = lv_textarea_get_text(objects.printer_ip_input_1);
    }
    if (objects.printer_code_input_1) {
        code = lv_textarea_get_text(objects.printer_code_input_1);
    }

    strncpy(saved_printers[editing_printer_index].name, name ? name : "", sizeof(saved_printers[0].name) - 1);
    strncpy(saved_printers[editing_printer_index].serial, serial ? serial : "", sizeof(saved_printers[0].serial) - 1);
    strncpy(saved_printers[editing_printer_index].ip_address, ip ? ip : "", sizeof(saved_printers[0].ip_address) - 1);
    strncpy(saved_printers[editing_printer_index].access_code, code ? code : "", sizeof(saved_printers[0].access_code) - 1);
    save_printers_to_nvs();

    editing_printer_index = -1;
    pending_settings_tab = 1;
    pendingScreen = SCREEN_ID_SETTINGS;
}

static void delete_confirm_yes_handler(lv_event_t *e) {
    if (editing_printer_index >= 0 && editing_printer_index < saved_printer_count) {
        for (int i = editing_printer_index; i < saved_printer_count - 1; i++) {
            saved_printers[i] = saved_printers[i + 1];
        }
        saved_printer_count--;
        save_printers_to_nvs();
    }

    if (delete_confirm_modal) {
        lv_obj_delete(delete_confirm_modal);
        delete_confirm_modal = NULL;
    }

    editing_printer_index = -1;
    pending_settings_tab = 1;
    pendingScreen = SCREEN_ID_SETTINGS;
}

static void delete_confirm_no_handler(lv_event_t *e) {
    if (delete_confirm_modal) {
        lv_obj_delete(delete_confirm_modal);
        delete_confirm_modal = NULL;
    }
}

static void printer_delete_click_handler(lv_event_t *e) {
    printer_hide_keyboard();

    if (editing_printer_index < 0 || editing_printer_index >= saved_printer_count) {
        return;
    }

    if (!objects.settings_printer_edit) return;

    delete_confirm_modal = lv_obj_create(objects.settings_printer_edit);
    lv_obj_set_size(delete_confirm_modal, 400, 180);
    lv_obj_center(delete_confirm_modal);
    lv_obj_set_style_bg_color(delete_confirm_modal, lv_color_hex(0xff1a1a1a), LV_PART_MAIN);
    lv_obj_set_style_border_color(delete_confirm_modal, lv_color_hex(0xffff5555), LV_PART_MAIN);
    lv_obj_set_style_border_width(delete_confirm_modal, 2, LV_PART_MAIN);
    lv_obj_set_style_radius(delete_confirm_modal, 12, LV_PART_MAIN);
    lv_obj_set_style_pad_all(delete_confirm_modal, 20, LV_PART_MAIN);
    lv_obj_clear_flag(delete_confirm_modal, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *title = lv_label_create(delete_confirm_modal);
    lv_label_set_text(title, "Delete Printer?");
    lv_obj_set_style_text_color(title, lv_color_hex(0xffff5555), LV_PART_MAIN);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_18, LV_PART_MAIN);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 0);

    lv_obj_t *msg = lv_label_create(delete_confirm_modal);
    char buf[128];
    snprintf(buf, sizeof(buf), "Delete \"%s\"?\nThis cannot be undone.", saved_printers[editing_printer_index].name);
    lv_label_set_text(msg, buf);
    lv_obj_set_style_text_color(msg, lv_color_hex(0xffcccccc), LV_PART_MAIN);
    lv_obj_set_style_text_align(msg, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_obj_align(msg, LV_ALIGN_CENTER, 0, -10);

    lv_obj_t *cancel_btn = lv_button_create(delete_confirm_modal);
    lv_obj_set_size(cancel_btn, 120, 40);
    lv_obj_align(cancel_btn, LV_ALIGN_BOTTOM_LEFT, 20, 0);
    lv_obj_set_style_bg_color(cancel_btn, lv_color_hex(0xff333333), LV_PART_MAIN);
    lv_obj_add_event_cb(cancel_btn, delete_confirm_no_handler, LV_EVENT_CLICKED, NULL);
    lv_obj_t *cancel_label = lv_label_create(cancel_btn);
    lv_label_set_text(cancel_label, "Cancel");
    lv_obj_center(cancel_label);

    lv_obj_t *delete_btn = lv_button_create(delete_confirm_modal);
    lv_obj_set_size(delete_btn, 120, 40);
    lv_obj_align(delete_btn, LV_ALIGN_BOTTOM_RIGHT, -20, 0);
    lv_obj_set_style_bg_color(delete_btn, lv_color_hex(0xffff5555), LV_PART_MAIN);
    lv_obj_add_event_cb(delete_btn, delete_confirm_yes_handler, LV_EVENT_CLICKED, NULL);
    lv_obj_t *delete_label = lv_label_create(delete_btn);
    lv_label_set_text(delete_label, "Delete");
    lv_obj_center(delete_label);
}

static void printer_connect_toggle_handler(lv_event_t *e) {
    if (editing_printer_index < 0 || editing_printer_index >= saved_printer_count) return;

    int current_state = saved_printers[editing_printer_index].mqtt_state;

    if (current_state == 0) {
        // TODO: Implement actual MQTT connection
        // For now, directly transition to connected
        saved_printers[editing_printer_index].mqtt_state = 2;  // Connected
    } else if (current_state == 1 || current_state == 2) {
        saved_printers[editing_printer_index].mqtt_state = 0;  // Disconnected
    }

    update_printer_edit_ui();
}

// Check if any edit fields have changed from original values
static bool printer_edit_has_changes(void) {
    const char *name = objects.printer_name_input_1 ? lv_textarea_get_text(objects.printer_name_input_1) : "";
    const char *serial = objects.printer_serial_input_1 ? lv_textarea_get_text(objects.printer_serial_input_1) : "";
    const char *ip = objects.printer_ip_input_1 ? lv_textarea_get_text(objects.printer_ip_input_1) : "";
    const char *code = objects.printer_code_input_1 ? lv_textarea_get_text(objects.printer_code_input_1) : "";

    return strcmp(name, original_printer_name) != 0 ||
           strcmp(serial, original_printer_serial) != 0 ||
           strcmp(ip, original_printer_ip) != 0 ||
           strcmp(code, original_printer_code) != 0;
}

// Update save button enabled state based on changes
static void update_printer_save_button_state(void) {
    if (!objects.printer_edit_btn) return;

    bool has_changes = printer_edit_has_changes();
    if (has_changes) {
        lv_obj_remove_state(objects.printer_edit_btn, LV_STATE_DISABLED);
        lv_obj_set_style_bg_color(objects.printer_edit_btn, lv_color_hex(0xff00ff00), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(objects.printer_edit_btn, 255, LV_PART_MAIN);
    } else {
        lv_obj_add_state(objects.printer_edit_btn, LV_STATE_DISABLED);
        lv_obj_set_style_bg_color(objects.printer_edit_btn, lv_color_hex(0xff444444), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(objects.printer_edit_btn, 255, LV_PART_MAIN);
    }
}

// Handler for text changes in edit fields
static void printer_edit_text_changed_handler(lv_event_t *e) {
    update_printer_save_button_state();
}

void update_printer_edit_ui(void) {
    if (!objects.settings_printer_edit) return;
    if (editing_printer_index < 0 || editing_printer_index >= saved_printer_count) return;

    int mqtt_state = saved_printers[editing_printer_index].mqtt_state;

    if (objects.printer_connect_btn) {
        lv_obj_t *label = lv_obj_get_child(objects.printer_connect_btn, 0);

        switch (mqtt_state) {
            case 0:
                if (label) lv_label_set_text(label, "Connect");
                lv_obj_set_style_bg_color(objects.printer_connect_btn, lv_color_hex(0xff00ff00), LV_PART_MAIN);
                if (label) lv_obj_set_style_text_color(label, lv_color_hex(0xff000000), LV_PART_MAIN);
                break;
            case 1:
                if (label) lv_label_set_text(label, "Connecting...");
                lv_obj_set_style_bg_color(objects.printer_connect_btn, lv_color_hex(0xffffaa00), LV_PART_MAIN);
                if (label) lv_obj_set_style_text_color(label, lv_color_hex(0xff000000), LV_PART_MAIN);
                break;
            case 2:
                if (label) lv_label_set_text(label, "Disconnect");
                lv_obj_set_style_bg_color(objects.printer_connect_btn, lv_color_hex(0xffff5555), LV_PART_MAIN);
                if (label) lv_obj_set_style_text_color(label, lv_color_hex(0xffffffff), LV_PART_MAIN);
                break;
        }
    }
}

void wire_printer_edit_buttons(void) {
    if (!objects.settings_printer_edit) return;

    // Reset module state when screen is created
    printer_keyboard = NULL;
    printer_focused_ta = NULL;
    printer_moved_form = NULL;
    printer_form_original_y = -1;
    delete_confirm_modal = NULL;

    if (objects.printer_name_input_1) {
        lv_obj_add_flag(objects.printer_name_input_1, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(objects.printer_name_input_1, printer_edit_textarea_click_handler, LV_EVENT_CLICKED, NULL);
        lv_obj_add_event_cb(objects.printer_name_input_1, printer_edit_text_changed_handler, LV_EVENT_VALUE_CHANGED, NULL);
    }
    if (objects.printer_serial_input_1) {
        lv_obj_add_flag(objects.printer_serial_input_1, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(objects.printer_serial_input_1, printer_edit_textarea_click_handler, LV_EVENT_CLICKED, NULL);
        lv_obj_add_event_cb(objects.printer_serial_input_1, printer_edit_text_changed_handler, LV_EVENT_VALUE_CHANGED, NULL);
    }
    if (objects.printer_ip_input_1) {
        lv_obj_add_flag(objects.printer_ip_input_1, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(objects.printer_ip_input_1, printer_edit_textarea_click_handler, LV_EVENT_CLICKED, NULL);
        lv_obj_add_event_cb(objects.printer_ip_input_1, printer_edit_text_changed_handler, LV_EVENT_VALUE_CHANGED, NULL);
    }
    if (objects.printer_code_input_1) {
        lv_obj_add_flag(objects.printer_code_input_1, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(objects.printer_code_input_1, printer_edit_textarea_click_handler, LV_EVENT_CLICKED, NULL);
        lv_obj_add_event_cb(objects.printer_code_input_1, printer_edit_text_changed_handler, LV_EVENT_VALUE_CHANGED, NULL);
        lv_textarea_set_password_mode(objects.printer_code_input_1, true);
    }

    if (objects.printer_edit_btn) {
        lv_obj_add_event_cb(objects.printer_edit_btn, printer_save_click_handler, LV_EVENT_CLICKED, NULL);
    }

    if (objects.printer_delete_btn_3) {
        lv_obj_add_event_cb(objects.printer_delete_btn_3, printer_delete_click_handler, LV_EVENT_CLICKED, NULL);
    }

    if (objects.printer_connect_btn) {
        lv_obj_add_event_cb(objects.printer_connect_btn, printer_connect_toggle_handler, LV_EVENT_CLICKED, NULL);
    }

    // Pre-fill fields with existing printer data and store originals for change detection
    if (editing_printer_index >= 0 && editing_printer_index < saved_printer_count) {
        // Store original values
        strncpy(original_printer_name, saved_printers[editing_printer_index].name, sizeof(original_printer_name) - 1);
        strncpy(original_printer_serial, saved_printers[editing_printer_index].serial, sizeof(original_printer_serial) - 1);
        strncpy(original_printer_ip, saved_printers[editing_printer_index].ip_address, sizeof(original_printer_ip) - 1);
        strncpy(original_printer_code, saved_printers[editing_printer_index].access_code, sizeof(original_printer_code) - 1);

        if (objects.printer_name_input_1) {
            lv_textarea_set_text(objects.printer_name_input_1, saved_printers[editing_printer_index].name);
        }
        if (objects.printer_serial_input_1) {
            lv_textarea_set_text(objects.printer_serial_input_1, saved_printers[editing_printer_index].serial);
        }
        if (objects.printer_ip_input_1) {
            lv_textarea_set_text(objects.printer_ip_input_1, saved_printers[editing_printer_index].ip_address);
        }
        if (objects.printer_code_input_1) {
            lv_textarea_set_text(objects.printer_code_input_1, saved_printers[editing_printer_index].access_code);
        }
    }

    // Initialize save button as disabled (no changes yet)
    update_printer_save_button_state();
    update_printer_edit_ui();
}

// =============================================================================
// Dynamic Printer List
// =============================================================================

void update_printers_list(void) {
    if (!objects.tab_printers_content) return;

    // DELETE (not just hide) ALL EEZ template printer rows in tab_printers_content:
    // obj243 at y=70, obj248 at y=130, obj253 at y=190
    // NOTE: obj238 is the WiFi icon on network tab - DO NOT touch it here!
    if (objects.obj243) {
        lv_obj_delete(objects.obj243);
        objects.obj243 = NULL;
    }
    if (objects.obj248) {
        lv_obj_delete(objects.obj248);
        objects.obj248 = NULL;
    }
    if (objects.obj253) {
        lv_obj_delete(objects.obj253);
        objects.obj253 = NULL;
    }

    // Delete old dynamic rows
    for (int i = 0; i < MAX_PRINTERS; i++) {
        if (dynamic_printer_rows[i]) {
            lv_obj_delete(dynamic_printer_rows[i]);
            dynamic_printer_rows[i] = NULL;
        }
    }

    // Convert tab_printers_content to use column flex layout for proper ordering
    // This ensures rows are positioned sequentially without gaps
    lv_obj_set_flex_flow(objects.tab_printers_content, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(objects.tab_printers_content, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(objects.tab_printers_content, 10, LV_PART_MAIN);  // Gap between rows
    lv_obj_set_style_pad_top(objects.tab_printers_content, 10, LV_PART_MAIN);

    // Create rows for each saved printer
    for (int i = 0; i < saved_printer_count && i < MAX_PRINTERS; i++) {
        lv_obj_t *row = lv_obj_create(objects.tab_printers_content);
        dynamic_printer_rows[i] = row;

        // Row styling - match EEZ generated style exactly
        lv_obj_set_pos(row, 15, 0);  // Position will be handled by flex parent
        lv_obj_set_size(row, 770, 50);
        lv_obj_set_style_pad_top(row, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_pad_bottom(row, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE|LV_OBJ_FLAG_SCROLL_CHAIN_HOR|LV_OBJ_FLAG_SCROLL_CHAIN_VER|LV_OBJ_FLAG_SCROLL_ELASTIC|LV_OBJ_FLAG_SCROLL_MOMENTUM|LV_OBJ_FLAG_SCROLL_WITH_ARROW);
        lv_obj_set_style_bg_color(row, lv_color_hex(0xff2d2d2d), LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_bg_opa(row, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_radius(row, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_border_width(row, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_pad_left(row, 15, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_pad_right(row, 15, LV_PART_MAIN | LV_STATE_DEFAULT);

        // Printer name - same position as EEZ template
        lv_obj_t *name_label = lv_label_create(row);
        lv_obj_set_pos(name_label, 45, 16);
        lv_obj_set_size(name_label, 200, 20);
        lv_label_set_long_mode(name_label, LV_LABEL_LONG_WRAP);
        lv_obj_clear_flag(name_label, LV_OBJ_FLAG_CLICK_FOCUSABLE|LV_OBJ_FLAG_GESTURE_BUBBLE|LV_OBJ_FLAG_PRESS_LOCK|LV_OBJ_FLAG_SCROLLABLE|LV_OBJ_FLAG_SCROLL_CHAIN_HOR|LV_OBJ_FLAG_SCROLL_CHAIN_VER|LV_OBJ_FLAG_SCROLL_ELASTIC|LV_OBJ_FLAG_SCROLL_MOMENTUM|LV_OBJ_FLAG_SCROLL_WITH_ARROW|LV_OBJ_FLAG_SNAPPABLE);
        lv_label_set_text(name_label, saved_printers[i].name);
        lv_obj_set_style_text_color(name_label, lv_color_hex(0xffffffff), LV_PART_MAIN);
        lv_obj_set_style_text_font(name_label, &lv_font_montserrat_16, LV_PART_MAIN);
        lv_obj_clear_flag(name_label, LV_OBJ_FLAG_CLICKABLE);

        // Status - absolute position
        lv_obj_t *status_label = lv_label_create(row);
        const char *status_text = "Offline";
        lv_color_t status_color = lv_color_hex(0xff888888);
        switch (saved_printers[i].mqtt_state) {
            case 1:
                status_text = "Connecting";
                status_color = lv_color_hex(0xffffaa00);
                break;
            case 2:
                status_text = "Online";
                status_color = lv_color_hex(0xff00ff00);
                break;
        }
        lv_label_set_text(status_label, status_text);
        lv_obj_set_style_text_color(status_label, status_color, LV_PART_MAIN);
        lv_obj_set_style_text_font(status_label, &lv_font_montserrat_14, LV_PART_MAIN);
        lv_obj_set_pos(status_label, 630, 16);
        lv_obj_clear_flag(status_label, LV_OBJ_FLAG_CLICKABLE);

        // Chevron - absolute position
        lv_obj_t *chevron = lv_label_create(row);
        lv_label_set_text(chevron, ">");
        lv_obj_set_style_text_color(chevron, lv_color_hex(0xff666666), LV_PART_MAIN);
        lv_obj_set_style_text_font(chevron, &lv_font_montserrat_18, LV_PART_MAIN);
        lv_obj_set_pos(chevron, 740, 14);
        lv_obj_clear_flag(chevron, LV_OBJ_FLAG_CLICKABLE);

        // 3D cube icon - match EEZ exactly
        lv_obj_t *icon = lv_image_create(row);
        lv_obj_set_pos(icon, -38, -25);
        lv_obj_set_size(icon, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
        lv_image_set_src(icon, &img_3d_cube);
        lv_image_set_scale(icon, 80);
        lv_obj_set_style_image_recolor(icon, lv_color_hex(0xff00ff00), LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_image_recolor_opa(icon, 255, LV_PART_MAIN | LV_STATE_DEFAULT);

        // Make clickable
        lv_obj_add_flag(row, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_style_bg_color(row, lv_color_hex(0xff3d3d3d), LV_PART_MAIN | LV_STATE_PRESSED);
        lv_obj_add_event_cb(row, printer_row_click_handler, LV_EVENT_CLICKED, (void*)(intptr_t)i);
    }
}

static void printer_row_click_handler(lv_event_t *e) {
    int index = (int)(intptr_t)lv_event_get_user_data(e);
    if (index >= 0 && index < saved_printer_count) {
        editing_printer_index = index;
        pendingScreen = SCREEN_ID_SETTINGS_PRINTER_EDIT;
    }
}

void wire_printers_tab(void) {
    // obj234 "Add Printer" is already wired by wire_content_rows()
    // Just update the dynamic printer list
    update_printers_list();
}

// =============================================================================
// Screen Cleanup Helper (called by ui_core.c)
// =============================================================================

void ui_printer_cleanup(void) {
    printer_keyboard = NULL;
    printer_focused_ta = NULL;
    printer_scan_list = NULL;
    printer_moved_form = NULL;
    printer_form_original_y = -1;
    delete_confirm_modal = NULL;

    for (int i = 0; i < MAX_PRINTERS; i++) {
        dynamic_printer_rows[i] = NULL;
    }
}
