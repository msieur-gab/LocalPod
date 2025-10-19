#!/bin/bash

# Identity Platform SDK - Demo Launcher
echo "🔐 Identity Platform SDK - Demo"
echo "================================"
echo ""
echo "Starting local server..."
echo ""

# Check if port 8000 is available
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 8000 is already in use!"
    echo "Please stop the existing server or use a different port."
    exit 1
fi

# Try different server options
if command -v python3 &> /dev/null; then
    echo "✅ Starting Python HTTP server..."
    echo "📍 Open: http://localhost:8000/demo.html"
    echo ""
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "✅ Starting Python HTTP server..."
    echo "📍 Open: http://localhost:8000/demo.html"
    echo ""
    python -m SimpleHTTPServer 8000
elif command -v php &> /dev/null; then
    echo "✅ Starting PHP server..."
    echo "📍 Open: http://localhost:8000/demo.html"
    echo ""
    php -S localhost:8000
else
    echo "❌ No suitable server found!"
    echo ""
    echo "Please install one of the following:"
    echo "  - Python 3: sudo apt install python3"
    echo "  - PHP: sudo apt install php"
    echo "  - Node.js http-server: npm install -g http-server"
    echo ""
    echo "Or run manually:"
    echo "  npx http-server -p 8000"
    exit 1
fi
