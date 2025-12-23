#!/bin/bash
# publish-index.sh
# Publish the docs-index.json to a GitHub repository for dynamic loading
#
# Usage:
#   ./scripts/publish-index.sh
#
# Prerequisites:
#   1. Create a GitHub repo named 'docs-index' (e.g., gptproto/docs-index)
#   2. Clone it to a sibling directory: ../docs-index
#   3. Run this script after updating documentation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INDEX_FILE="$PROJECT_DIR/src/generated/docs-index.json"
DOCS_INDEX_REPO="${DOCS_INDEX_REPO:-$PROJECT_DIR/../gptproto_doc}"

echo "📚 Publishing GPTProto docs index..."

# Check if index file exists
if [ ! -f "$INDEX_FILE" ]; then
    echo "❌ Error: docs-index.json not found. Run 'npm run build:index' first."
    exit 1
fi

# Check if docs-index repo exists
if [ ! -d "$DOCS_INDEX_REPO/.git" ]; then
    echo "❌ Error: docs-index repository not found at $DOCS_INDEX_REPO"
    echo ""
    echo "To set up:"
    echo "  1. Create a GitHub repo named 'docs-index'"
    echo "  2. Clone it: git clone https://github.com/YOUR_USERNAME/docs-index.git $DOCS_INDEX_REPO"
    echo "  3. Run this script again"
    exit 1
fi

# Copy index file
echo "📋 Copying docs-index.json..."
cp "$INDEX_FILE" "$DOCS_INDEX_REPO/docs-index.json"

# Get index stats
TOTAL_DOCS=$(grep -o '"totalDocs":[0-9]*' "$INDEX_FILE" | cut -d: -f2)
GENERATED_AT=$(grep -o '"generatedAt":"[^"]*"' "$INDEX_FILE" | cut -d'"' -f4)

# Commit and push
cd "$DOCS_INDEX_REPO"
git add docs-index.json

if git diff --cached --quiet; then
    echo "✅ No changes to publish."
else
    git commit -m "Update docs index: $TOTAL_DOCS docs at $GENERATED_AT"
    git push origin main
    echo ""
    echo "✅ Published successfully!"
    echo "   Total docs: $TOTAL_DOCS"
    echo "   Generated: $GENERATED_AT"
    echo ""
    echo "📡 Index URL:"
    echo "   https://raw.githubusercontent.com/$(git remote get-url origin | sed 's/.*github.com[:/]//' | sed 's/.git$//')/main/docs-index.json"
fi
