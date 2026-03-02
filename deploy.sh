#!/bin/bash
# NanoClaw Deployment Script for Intel Mac (Production)
#
# This script handles deployment from the M1 dev machine to Intel production:
# 1. Backs up the database
# 2. Pulls latest code from git
# 3. Installs/updates dependencies
# 4. Rebuilds container if Dockerfile changed
# 5. Restarts the launchd service
#
# Usage: ./deploy.sh

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  NanoClaw Production Deployment${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if we're on the production machine (Intel Mac)
if [[ $(uname -m) != "x86_64" ]]; then
    echo -e "${YELLOW}Warning: This doesn't appear to be the Intel Mac (detected: $(uname -m))${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Function to backup database
backup_database() {
    echo -e "${BLUE}[1/5] Backing up database...${NC}"

    DB_PATH="store/messages.db"
    BACKUP_DIR="store/backups"
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_PATH="$BACKUP_DIR/messages_${TIMESTAMP}.db"

    if [ -f "$DB_PATH" ]; then
        mkdir -p "$BACKUP_DIR"
        cp "$DB_PATH" "$BACKUP_PATH"
        echo -e "${GREEN}✓ Database backed up to: $BACKUP_PATH${NC}"

        # Keep only last 10 backups
        BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/messages_*.db 2>/dev/null | wc -l)
        if [ "$BACKUP_COUNT" -gt 10 ]; then
            echo -e "${YELLOW}  Cleaning old backups (keeping last 10)...${NC}"
            ls -1t "$BACKUP_DIR"/messages_*.db | tail -n +11 | xargs rm -f
        fi
    else
        echo -e "${YELLOW}  No database found (first deployment?)${NC}"
    fi
    echo ""
}

# Function to check if Dockerfile changed
check_dockerfile_changed() {
    BEFORE_HASH=$(git rev-parse HEAD:container/Dockerfile 2>/dev/null || echo "")
    git fetch origin main --quiet 2>/dev/null || git fetch --quiet 2>/dev/null || true
    AFTER_HASH=$(git rev-parse FETCH_HEAD:container/Dockerfile 2>/dev/null || echo "")

    if [ "$BEFORE_HASH" != "$AFTER_HASH" ] && [ -n "$AFTER_HASH" ]; then
        return 0  # Changed
    else
        return 1  # Not changed
    fi
}

# Function to pull latest code
pull_code() {
    echo -e "${BLUE}[2/5] Pulling latest code from git...${NC}"

    # Stash any local changes to .env
    if [ -f ".env" ]; then
        cp .env .env.backup
        echo -e "${YELLOW}  Backed up .env file${NC}"
    fi

    # Check current branch
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    echo -e "  Current branch: ${GREEN}$CURRENT_BRANCH${NC}"

    # Pull latest changes
    if git pull origin "$CURRENT_BRANCH"; then
        echo -e "${GREEN}✓ Code updated successfully${NC}"
    else
        echo -e "${RED}✗ Git pull failed${NC}"
        # Restore .env if pull failed
        if [ -f ".env.backup" ]; then
            cp .env.backup .env
            echo -e "${YELLOW}  Restored .env file${NC}"
        fi
        exit 1
    fi

    # Restore .env if it was overwritten
    if [ -f ".env.backup" ]; then
        if ! cmp -s .env .env.backup; then
            cp .env.backup .env
            echo -e "${YELLOW}  Restored .env file (was modified by pull)${NC}"
        fi
        rm .env.backup
    fi

    echo ""
}

# Function to install dependencies
install_deps() {
    echo -e "${BLUE}[3/5] Installing dependencies...${NC}"

    if npm install; then
        echo -e "${GREEN}✓ Dependencies installed${NC}"
    else
        echo -e "${RED}✗ npm install failed${NC}"
        exit 1
    fi

    echo ""
}

# Function to rebuild container
rebuild_container() {
    local dockerfile_changed=$1

    echo -e "${BLUE}[4/5] Checking container image...${NC}"

    if [ "$dockerfile_changed" = "true" ]; then
        echo -e "${YELLOW}  Dockerfile changed - rebuilding container...${NC}"

        if ./container/build.sh; then
            echo -e "${GREEN}✓ Container rebuilt successfully${NC}"
        else
            echo -e "${RED}✗ Container build failed${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✓ Dockerfile unchanged - skipping rebuild${NC}"
        echo -e "  ${YELLOW}To force rebuild, run: ./container/build.sh${NC}"
    fi

    echo ""
}

# Function to restart service
restart_service() {
    echo -e "${BLUE}[5/5] Restarting NanoClaw service...${NC}"

    SERVICE_NAME="com.nanoclaw"
    PLIST_PATH="$HOME/Library/LaunchAgents/${SERVICE_NAME}.plist"

    if [ ! -f "$PLIST_PATH" ]; then
        echo -e "${YELLOW}  Service not installed - run setup first${NC}"
        echo -e "${YELLOW}  You can start manually with: npm run dev${NC}"
        return
    fi

    # Stop the service if running
    if launchctl list | grep -q "$SERVICE_NAME"; then
        echo -e "  Stopping service..."
        launchctl unload "$PLIST_PATH" 2>/dev/null || true
        sleep 2
    fi

    # Start the service
    echo -e "  Starting service..."
    if launchctl load "$PLIST_PATH"; then
        echo -e "${GREEN}✓ Service restarted successfully${NC}"
        sleep 2

        # Check if service is running
        if launchctl list | grep -q "$SERVICE_NAME"; then
            echo -e "${GREEN}✓ Service is running${NC}"
        else
            echo -e "${YELLOW}  Service may not have started - check logs:${NC}"
            echo -e "  ${YELLOW}tail -f logs/nanoclaw.log${NC}"
        fi
    else
        echo -e "${RED}✗ Failed to start service${NC}"
        echo -e "${YELLOW}  Try running manually: npm run dev${NC}"
        exit 1
    fi

    echo ""
}

# Main deployment flow
main() {
    # Check if Dockerfile will change
    DOCKERFILE_CHANGED="false"
    if check_dockerfile_changed; then
        DOCKERFILE_CHANGED="true"
        echo -e "${YELLOW}Note: Dockerfile has changes - will rebuild container${NC}"
        echo ""
    fi

    # Step 1: Backup database
    backup_database

    # Step 2: Pull code
    pull_code

    # Step 3: Install dependencies
    install_deps

    # Step 4: Rebuild container if needed
    rebuild_container "$DOCKERFILE_CHANGED"

    # Step 5: Restart service
    restart_service

    # Success!
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}  Deployment Complete!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "Next steps:"
    echo -e "  1. Check service logs: ${BLUE}tail -f logs/nanoclaw.log${NC}"
    echo -e "  2. Test Telegram: Send a message to your bot"
    echo -e "  3. Verify database: Check that conversations are preserved"
    echo ""
    echo -e "Rollback if needed:"
    echo -e "  Database: ${BLUE}ls store/backups/${NC} (restore from backup)"
    echo -e "  Code: ${BLUE}git log${NC} and ${BLUE}git reset --hard <commit>${NC}"
    echo ""
}

# Run main deployment
main
