#!/bin/bash
# YourZon WhatsApp AI Automation — One-click start

set -e
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════╗"
echo "║   YourZon — WhatsApp AI Automation   ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js not installed. Get it from: https://nodejs.org${NC}"
  exit 1
fi

NODE_VER=$(node -v | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}❌ Node.js 18+ required. Current: $(node -v)${NC}"
  exit 1
fi

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install --silent 2>/dev/null || npm install
cd backend && npm install --silent 2>/dev/null || npm install
cd ..

# Setup .env if missing
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo -e "${YELLOW}⚙️  Created backend/.env — edit it to add your API keys${NC}"
fi

# Check API keys
GEMINI_KEY=$(grep "GEMINI_API_KEY" backend/.env | cut -d= -f2 | tr -d ' ')
CLAUDE_KEY=$(grep "CLAUDE_API_KEY" backend/.env | cut -d= -f2 | tr -d ' ')
DEMO_MODE=$(grep "DEMO_MODE" backend/.env | cut -d= -f2 | tr -d ' ')

if [ -z "$GEMINI_KEY" ] || [ "$GEMINI_KEY" = "your_gemini_api_key_here" ]; then
  echo -e "${YELLOW}⚠️  No Gemini API key — using message templates${NC}"
  echo -e "   Get free key: https://aistudio.google.com/app/apikey"
fi
if [ -z "$CLAUDE_KEY" ] || [ "$CLAUDE_KEY" = "your_claude_api_key_here" ]; then
  echo -e "${YELLOW}⚠️  No Claude API key — auto-replies use templates${NC}"
  echo -e "   Get key: https://console.anthropic.com/"
fi

# Start backend
echo -e "\n${GREEN}🚀 Starting Backend...${NC}"
cd backend && node server.js &
BACKEND_PID=$!
cd ..

# Wait for backend
echo -ne "${YELLOW}⏳ Waiting for backend"
until curl -s http://localhost:3001/api/health > /dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo -e "${NC}"

WA_STATUS=$(curl -s http://localhost:3001/api/whatsapp/status | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "unknown")

echo -e "\n${GREEN}✅ Backend running on http://localhost:3001${NC}"
echo -e "${GREEN}📊 API ready: http://localhost:3001/api/health${NC}"

if [ "$DEMO_MODE" = "true" ]; then
  echo -e "\n${CYAN}🎭 DEMO MODE — messages simulated (set DEMO_MODE=false for real WhatsApp)${NC}"
else
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}📱 TO CONNECT WHATSAPP:${NC}"
  echo -e "   1. Open WhatsApp on your phone"
  echo -e "   2. Go to Settings → Linked Devices"
  echo -e "   3. Tap 'Link a Device'"
  echo -e "   4. Scan the QR code shown above"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi

echo ""
echo -e "${GREEN}📱 To start the mobile app (in another terminal):${NC}"
echo -e "   npx expo start"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"

# Trap Ctrl+C
trap "echo -e '\n${RED}Stopping...${NC}'; kill $BACKEND_PID 2>/dev/null; exit 0" INT
wait $BACKEND_PID
