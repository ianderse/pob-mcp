#!/bin/bash

# Test script for file watching functionality

echo "=== Testing File Watcher ==="
echo ""

# Create a test directory
TEST_DIR="./test-builds"
mkdir -p "$TEST_DIR"

echo "1. Created test directory: $TEST_DIR"
echo ""

# Copy example build to test directory
cp example-build.xml "$TEST_DIR/test-build-1.xml"
echo "2. Created test-build-1.xml"
echo ""

echo "3. To test the file watcher:"
echo "   - Start the MCP server with POB_DIRECTORY=$TEST_DIR"
echo "   - Call 'start_watching' tool"
echo "   - Call 'watch_status' to confirm it's enabled"
echo "   - Modify test-build-1.xml in the test-builds directory"
echo "   - Call 'get_recent_changes' to see the detected change"
echo "   - Call 'analyze_build' on test-build-1.xml to see cached data is invalidated"
echo ""

echo "4. To modify the test file, run:"
echo "   echo '<!-- test change -->' >> $TEST_DIR/test-build-1.xml"
echo ""

echo "5. To clean up after testing:"
echo "   rm -rf $TEST_DIR"
echo ""

echo "=== Test Setup Complete ==="
