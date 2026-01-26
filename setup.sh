#!/bin/bash

echo "Restaurant Inventory App Setup"
echo "==============================="
echo ""

# Check if npm cache needs fixing
if [ -d ~/.npm ]; then
    echo "Fixing npm cache permissions..."
    sudo chown -R $(whoami) ~/.npm
fi

echo ""
echo "Installing backend dependencies..."
cd backend && npm install
cd ..

echo ""
echo "Installing frontend dependencies..."
cd frontend && npm install
cd ..

echo ""
echo "Setup complete!"
echo ""
echo "To start the app, run:"
echo "  Terminal 1: cd backend && npm run dev"
echo "  Terminal 2: cd frontend && npm run dev"
echo ""
echo "Then open http://localhost:5173 in your browser"
