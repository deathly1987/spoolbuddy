#!/bin/bash
# Install SpoolBuddy systemd services
# Run as root or with sudo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="/opt/spoolbuddy"
DATA_DIR="/var/lib/spoolbuddy"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== SpoolBuddy Systemd Installation ===${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Parse arguments
MODE="${1:-production}"

case "$MODE" in
    production|prod)
        echo "Installing production service..."
        SERVICE_FILE="spoolbuddy.service"
        ;;
    development|dev)
        echo "Installing development service..."
        SERVICE_FILE="spoolbuddy-dev.service"
        ;;
    *)
        echo "Usage: $0 [production|development]"
        exit 1
        ;;
esac

# Create spoolbuddy user if it doesn't exist (production only)
if [ "$MODE" = "production" ] || [ "$MODE" = "prod" ]; then
    if ! id -u spoolbuddy > /dev/null 2>&1; then
        echo "Creating spoolbuddy user..."
        useradd -r -s /bin/false -d "$INSTALL_DIR" spoolbuddy
        usermod -aG dialout spoolbuddy
    fi
fi

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR"

# Copy project files (production)
if [ "$MODE" = "production" ] || [ "$MODE" = "prod" ]; then
    echo "Copying files to $INSTALL_DIR..."

    # Backend
    cp -r "$PROJECT_DIR/backend" "$INSTALL_DIR/"

    # Frontend (built)
    if [ -d "$PROJECT_DIR/frontend/dist" ]; then
        cp -r "$PROJECT_DIR/frontend/dist" "$INSTALL_DIR/backend/static"
    else
        echo -e "${YELLOW}Warning: Frontend not built. Run 'cd frontend && npm run build' first.${NC}"
    fi

    # Create venv and install deps
    echo "Setting up Python environment..."
    cd "$INSTALL_DIR/backend"
    python3 -m venv venv
    ./venv/bin/pip install -r requirements.txt

    # Set ownership
    chown -R spoolbuddy:spoolbuddy "$INSTALL_DIR"
    chown -R spoolbuddy:spoolbuddy "$DATA_DIR"
fi

# Install systemd service
echo "Installing systemd service..."
cp "$SCRIPT_DIR/$SERVICE_FILE" /etc/systemd/system/spoolbuddy.service

# Install serial permissions service
echo "Installing serial permissions service..."
cp "$SCRIPT_DIR/spoolbuddy-serial.service" /etc/systemd/system/

# Install udev rules
echo "Installing udev rules..."
cp "$SCRIPT_DIR/99-spoolbuddy-serial.rules" /etc/udev/rules.d/
udevadm control --reload-rules 2>/dev/null || true
udevadm trigger 2>/dev/null || true

# Reload systemd
echo "Reloading systemd..."
systemctl daemon-reload

# Enable services
echo "Enabling services..."
systemctl enable spoolbuddy.service
systemctl enable spoolbuddy-serial.service

echo ""
echo -e "${GREEN}=== Installation Complete ===${NC}"
echo ""
echo "Commands:"
echo "  Start:   sudo systemctl start spoolbuddy"
echo "  Stop:    sudo systemctl stop spoolbuddy"
echo "  Status:  sudo systemctl status spoolbuddy"
echo "  Logs:    sudo journalctl -u spoolbuddy -f"
echo ""
echo "SpoolBuddy will be available at: http://localhost:3000"
echo ""

# Ask to start now
read -p "Start SpoolBuddy now? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    systemctl start spoolbuddy-serial.service
    systemctl start spoolbuddy.service
    echo -e "${GREEN}SpoolBuddy started!${NC}"
fi
