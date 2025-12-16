#!/bin/bash
# Install udev rules for SpoolBuddy serial device access

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_FILE="$SCRIPT_DIR/99-spoolbuddy-serial.rules"

if [ ! -f "$RULES_FILE" ]; then
    echo "Error: Rules file not found: $RULES_FILE"
    exit 1
fi

echo "Installing udev rules for SpoolBuddy serial devices..."

# Copy rules
sudo cp "$RULES_FILE" /etc/udev/rules.d/

# Reload udev
sudo udevadm control --reload-rules
sudo udevadm trigger

# Add current user to dialout group if not already
if ! groups | grep -q dialout; then
    echo "Adding $USER to dialout group..."
    sudo usermod -aG dialout "$USER"
    echo ""
    echo "IMPORTANT: Log out and back in for group changes to take effect!"
else
    echo "User already in dialout group."
fi

echo ""
echo "Done! Unplug and replug your ESP32 device."
