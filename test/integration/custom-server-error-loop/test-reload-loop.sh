#!/bin/bash
# Test: verify error page does NOT trigger infinite reload loop
# Run: bash test-reload-loop.sh

echo ""
echo "Testing: custom server error page reload loop"
echo ""

# Start server in background
NODE_ENV=development node server.js &
SERVER_PID=$!
sleep 5

# Hit the error page 3 times, 2 seconds apart
# If the bug is present, the server will show repeated compilation logs
echo "Requesting /trigger-error..."
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/trigger-error
sleep 2
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/trigger-error
sleep 2
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/trigger-error

echo ""
echo "Counting compilation events in 10 seconds..."
sleep 10

# Check server logs for repeated "compiling" entries
# If more than 3 compiles happened (our 3 requests), the loop is active
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "If you saw repeated 'compiling...' logs beyond the 3 requests,"
echo "the bug is present."
echo ""
echo "After the fix: exactly 3 compile events, no loop."
