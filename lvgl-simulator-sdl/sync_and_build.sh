#!/bin/bash
# Sync from Debian server, apply EEZ fixes, build and run simulator

set -e

cd "$(dirname "$0")"

echo "=== Syncing from Debian server ==="
cd ../../
rsync -avr --progress --delete --exclude='lvgl-simulator-sdl/build' claude:/opt/claude/projects/SpoolStation .
cd SpoolStation/lvgl-simulator-sdl

echo "=== Copying EEZ UI files ==="
# Copy all .h files
cp -f ../eez/src/ui/*.h ui/
# Copy all .c files EXCEPT ui.c (preserve custom navigation code)
for f in ../eez/src/ui/*.c; do
    if [ "$(basename "$f")" != "ui.c" ]; then
        cp -f "$f" ui/
    fi
done

echo "=== Applying LVGL 9.x fixes ==="
# Fix LVGL 9.x compatibility - images.h uses lv_img_dsc_t, convert to lv_image_dsc_t
sed -i '' 's/lv_img_dsc_t/lv_image_dsc_t/g' ui/images.h

# Fix EEZ-generated code bugs
sed -i '' 's/lv_image_set_pivot(obj, , );//g' ui/screens.c
sed -i '' 's/lv_image_set_rotation(obj, );//g' ui/screens.c
sed -i '' 's/LV_LABEL_LONG_undefined/LV_LABEL_LONG_WRAP/g' ui/screens.c

# Fix duplicate 'settings' identifier (button vs screen conflict)
# Use perl for complex patterns (more portable than sed)
perl -i -pe 's/lv_obj_t \*settings;/lv_obj_t *settings_main;/ if /encode_tag/ .. /catalog/' ui/screens.h
perl -i -pe 's/objects\.settings = obj;/objects.settings_main = obj;/ if /objects\.encode_tag = obj/ .. /objects\.catalog = obj/' ui/screens.c

echo "=== Building simulator ==="
rm -rf build
mkdir build
cd build
cmake ..
make -j10

echo "=== Running simulator ==="
./simulator
