#!/bin/bash
# Setup serial device access for SpoolBuddy
# Works on native Linux systems and provides guidance for containers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_FILE="$SCRIPT_DIR/99-spoolbuddy-serial.rules"

echo "=== SpoolBuddy Serial Device Setup ==="
echo ""

# Detect environment
if [ -f /.dockerenv ] || grep -q docker /proc/1/cgroup 2>/dev/null; then
    ENV_TYPE="docker"
elif systemd-detect-virt -c -q 2>/dev/null; then
    ENV_TYPE="container"
elif [ ! -d /run/udev ] && [ ! -S /run/udev/control ]; then
    ENV_TYPE="no-udev"
else
    ENV_TYPE="native"
fi

echo "Detected environment: $ENV_TYPE"
echo ""

case "$ENV_TYPE" in
    native)
        echo "Installing udev rules..."
        if [ -f "$RULES_FILE" ]; then
            sudo cp "$RULES_FILE" /etc/udev/rules.d/
            sudo udevadm control --reload-rules
            sudo udevadm trigger
            echo "Udev rules installed successfully."
        else
            echo "Warning: Rules file not found, creating inline..."
            sudo tee /etc/udev/rules.d/99-spoolbuddy-serial.rules > /dev/null << 'EOF'
SUBSYSTEM=="tty", KERNEL=="ttyACM*", GROUP="dialout", MODE="0660"
SUBSYSTEM=="tty", KERNEL=="ttyUSB*", GROUP="dialout", MODE="0660"
EOF
            sudo udevadm control --reload-rules
            sudo udevadm trigger
        fi

        # Add user to dialout group
        if ! groups | grep -q dialout; then
            echo "Adding $USER to dialout group..."
            sudo usermod -aG dialout "$USER"
            echo ""
            echo "IMPORTANT: Log out and back in for group changes to take effect!"
        fi

        echo ""
        echo "Done! Unplug and replug your device."
        ;;

    docker|container|no-udev)
        echo "Container/no-udev environment detected."
        echo ""
        echo "Option 1: Fix permissions now (temporary, until device unplug):"
        echo "  sudo chown root:dialout /dev/ttyUSB* /dev/ttyACM* 2>/dev/null"
        echo ""
        echo "Option 2: Install systemd service on HOST for persistent fix:"

        # Create systemd service file
        cat > /tmp/spoolbuddy-serial.service << 'EOF'
[Unit]
Description=Fix serial device permissions for SpoolBuddy
After=dev-ttyUSB0.device dev-ttyACM0.device

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'chown root:dialout /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

        echo ""
        echo "  Run on HOST (not in container):"
        echo "    sudo cp /tmp/spoolbuddy-serial.service /etc/systemd/system/"
        echo "    sudo systemctl daemon-reload"
        echo "    sudo systemctl enable --now spoolbuddy-serial.service"
        echo ""
        echo "Option 3: For Docker, add to docker-compose.yml:"
        echo "    services:"
        echo "      spoolbuddy:"
        echo "        group_add:"
        echo "          - dialout"
        echo "        devices:"
        echo "          - /dev/ttyUSB0:/dev/ttyUSB0"
        echo "          - /dev/ttyACM0:/dev/ttyACM0"
        echo "        # Or for dynamic devices:"
        echo "        volumes:"
        echo "          - /dev:/dev"
        echo "        privileged: true"
        echo ""

        # Try to fix now anyway
        echo "Attempting to fix permissions now..."
        if sudo chown root:dialout /dev/ttyUSB* /dev/ttyACM* 2>/dev/null; then
            echo "Permissions fixed for current session."
        else
            echo "Could not fix permissions (no devices or no sudo access)."
        fi
        ;;
esac

echo ""
echo "=== Current device status ==="
ls -la /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || echo "No serial devices found"
