#!/bin/bash
# TijusPro LMS - Start both backend and frontend

DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill any existing processes on our ports
lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null

echo "========================================="
echo "  TijusPro LMS"
echo "========================================="
echo ""

# Install root deps if needed
if [ ! -d "$DIR/node_modules" ]; then
  echo "[0/2] Installing backend dependencies..."
  cd "$DIR" && npm install
fi

# Install frontend deps if needed
if [ ! -d "$DIR/frontend/node_modules" ]; then
  echo "[0/2] Installing frontend dependencies..."
  cd "$DIR/frontend" && npm install
fi

# Start Node.js backend
echo "[1/2] Starting Node.js backend on http://localhost:8000 ..."
cd "$DIR"
node backend/server.js &
NODE_PID=$!

sleep 1

# Start React frontend
echo "[2/2] Starting React frontend on http://localhost:5173 ..."
cd "$DIR/frontend"
npm run dev &
VITE_PID=$!

echo ""
echo "========================================="
echo "  App running at: http://localhost:5173"
echo "  API running at: http://localhost:8000"
echo "========================================="
echo ""
echo "  Demo logins:"
echo "    admin@tijuspro.com / admin123"
echo "    rahul@tijuspro.com / tutor123"
echo "    aarav.mehta@student.tijuspro.com / student123"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

trap "echo ''; echo 'Shutting down...'; kill $NODE_PID $VITE_PID 2>/dev/null; exit 0" INT TERM
wait
