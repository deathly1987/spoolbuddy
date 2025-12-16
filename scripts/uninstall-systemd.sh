#!/bin/bash
# Uninstall SpoolBuddy systemd services
# Run as root or with sudo

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== SpoolBuddy Systemd Uninstallation ===${NC}"
echo ""

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Stop services
echo "Stopping services..."
systemctl stop spoolbuddy.service 2>/dev/null || true
systemctl stop spoolbuddy-serial.service 2>/dev/null || true

# Disable services
echo "Disabling services..."
systemctl disable spoolbuddy.service 2>/dev/null || true
systemctl disable spoolbuddy-serial.service 2>/dev/null || true

# Remove service files
echo "Removing service files..."
rm -f /etc/systemd/system/spoolbuddy.service
rm -f /etc/systemd/system/spoolbuddy-serial.service

# Remove udev rules
echo "Removing udev rules..."
rm -f /etc/udev/rules.d/99-spoolbuddy-serial.rules
udevadm control --reload-rules 2>/dev/null || true

# Reload systemd
systemctl daemon-reload

echo ""
read -p "Remove installation directory /opt/spoolbuddy? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf /opt/spoolbuddy
    echo "Installation directory removed."
fi

echo ""
read -p "Remove data directory /var/lib/spoolbuddy? (THIS DELETES YOUR DATABASE) [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf /var/lib/spoolbuddy
    echo "Data directory removed."
fi

echo ""
read -p "Remove spoolbuddy user? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    userdel spoolbuddy 2>/dev/null || true
    echo "User removed."
fi

echo ""
echo -e "${GREEN}Uninstallation complete.${NC}"
