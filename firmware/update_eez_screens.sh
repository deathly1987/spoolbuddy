#!/bin/bash
# Update screens from EEZ Studio export
# Run this after exporting from EEZ Studio to ../eez/src/ui/

set -e

EEZ_DIR="../eez/src/ui"
TARGET_DIR="components/eez_ui"

echo "Updating EEZ UI screens..."

# Check if EEZ export exists
if [ ! -d "$EEZ_DIR" ]; then
    echo "ERROR: EEZ export not found at $EEZ_DIR"
    echo "Export from EEZ Studio first!"
    exit 1
fi

# Copy all files EXCEPT ui.c (contains custom navigation code)
cp "$EEZ_DIR/screens.c" "$TARGET_DIR/"
cp "$EEZ_DIR/screens.h" "$TARGET_DIR/"
cp "$EEZ_DIR/images.h" "$TARGET_DIR/"
cp "$EEZ_DIR/images.c" "$TARGET_DIR/"
cp "$EEZ_DIR/vars.h" "$TARGET_DIR/"
cp "$EEZ_DIR/actions.h" "$TARGET_DIR/"
cp "$EEZ_DIR/styles.c" "$TARGET_DIR/"
cp "$EEZ_DIR/styles.h" "$TARGET_DIR/"
cp "$EEZ_DIR/structs.h" "$TARGET_DIR/"
cp "$EEZ_DIR/fonts.h" "$TARGET_DIR/"
cp "$EEZ_DIR"/ui_image_*.c "$TARGET_DIR/" 2>/dev/null || true

echo "  - Copied screens, images, and headers"

# ============================================================
# Fix LVGL 9.x compatibility
# ============================================================
sed -i 's/lv_img_dsc_t/lv_image_dsc_t/g' "$TARGET_DIR/images.h"
echo "  - Applied LVGL 9.x fix (lv_img_dsc_t -> lv_image_dsc_t)"

# ============================================================
# Fix EEZ-generated code bugs
# ============================================================

# Fix empty parameters in lv_image_set_pivot() - remove the calls entirely
sed -i 's/lv_image_set_pivot(obj, , );//g' "$TARGET_DIR/screens.c"

# Fix empty parameters in lv_image_set_rotation() - remove the calls entirely
sed -i 's/lv_image_set_rotation(obj, );//g' "$TARGET_DIR/screens.c"

# Fix undefined enum LV_LABEL_LONG_undefined -> LV_LABEL_LONG_WRAP
sed -i 's/LV_LABEL_LONG_undefined/LV_LABEL_LONG_WRAP/g' "$TARGET_DIR/screens.c"

echo "  - Fixed EEZ-generated code bugs"

# ============================================================
# Fix duplicate 'settings' identifier
# The main screen has a button called 'settings' which conflicts
# with the 'settings' screen. Rename to 'settings_main'.
# ============================================================

# In screens.h struct - find the SECOND occurrence (the button, not the screen)
# Line pattern: after ams_setup, encode_tag, there's "settings" before catalog
sed -i '/lv_obj_t \*encode_tag;/,/lv_obj_t \*catalog;/s/lv_obj_t \*settings;/lv_obj_t *settings_main;/' "$TARGET_DIR/screens.h"

# In screens.c - rename objects.settings to objects.settings_main only for the button
# The button is created in create_screen_main(), not create_screen_settings()
# Pattern: in the section that also creates ams_setup, encode_tag, catalog
sed -i '/objects.encode_tag = obj;/,/objects.catalog = obj;/{s/objects.settings = obj;/objects.settings_main = obj;/}' "$TARGET_DIR/screens.c"

echo "  - Fixed duplicate 'settings' identifier"

echo ""
echo "Done! Rebuild with: cargo build"
echo ""
