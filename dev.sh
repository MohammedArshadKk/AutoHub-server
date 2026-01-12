#!/bin/bash

# Kill any existing processes on port 5001
echo "🔍 Checking for processes on port 5001..."
lsof -ti:5001 | xargs kill -9 2>/dev/null

# Kill any existing nodemon/node server processes
pkill -f "node.*server.js" 2>/dev/null
pkill -f nodemon 2>/dev/null

# Wait a moment for cleanup
sleep 1

echo "✅ Port 5001 is now free"
echo "🚀 Starting server..."

# Start the development server
npm run dev
