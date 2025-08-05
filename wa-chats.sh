# @path: wa-chats.sh

set -euo pipefail

API_BASE_URL="http://localhost:3000/api"
AUTH_URL="$API_BASE_URL/auth"
CHATS_URL="$API_BASE_URL/chats"

JID="5215539985884@s.whatsapp.net"

call_endpoint() {
    local method=$1 url=$2 data=${3:-} # Default data to empty string if not provided

    local curl_args=(-sS -w "\n%{http_code}" -X "$method" "$url" -H "x-session-id: $sessionId")
    if [[ -n "$data" ]]; then
        curl_args+=(-H "Content-Type: application/json" -d "$data")
    fi

    resp=$(curl "${curl_args[@]}")

    http_body=$(echo "$resp" | sed '$d')
    http_status=$(echo "$resp" | tail -n1)
    echo "$http_body"  # Print the body for inspection

    return_status=$http_status
}

echo "🔧 1. Using static session ID…"
sessionId="52be7934-6b3c-4a13-b565-20ca98f4ff02"
echo

echo "⏳ 2. Initializing session on server…"
reload_raw=$(curl -sS -X POST "$AUTH_URL/reload" -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$sessionId\"}" -w "\n%{http_code}")
reload_body=$(echo "$reload_raw" | sed '$d')
reload_status=$(echo "$reload_raw" | tail -n1)
echo "   HTTP status: $reload_status"
echo "   Body: $reload_body"
if [[ "$reload_status" -ne 200 ]];
then
    echo "❌ Session initialization failed. Output: $reload_body"
    exit 1
fi
reloaded=$(echo "$reload_body" | jq -r '.reloaded')
if [[ "$reloaded" != "true" ]];
then
    echo "❌ Server did not reload the session correctly: $reload_body"
    exit 1
fi
echo "✅ Session created: $sessionId"
echo

echo "⏳ 3. Verifying authentication status…"
status_raw=$(curl -sS "$AUTH_URL/status?sessionId=$sessionId" -w "\n%{http_code}")
status_body=$(echo "$status_raw" | sed '$d')
status_code=$(echo "$status_raw" | tail -n1)
echo "   HTTP status: $status_code"
echo "   Body: $status_body"
if [[ "$status_code" -ne 200 ]];
then
    echo "❌ Error checking status: $status_body"
    exit 1
fi
authenticated=$(echo "$status_body" | jq -r '.authenticated')
echo "🔒 Authenticated: $authenticated"
if [[ "$authenticated" != "true" ]];
then
    echo "❌ Not authenticated."
    exit 1
fi
echo

echo "🚀 4. Starting chat endpoint tests…"

echo "   - 📁 GET /chats"
call_endpoint "GET" "$CHATS_URL/"
echo "     HTTP status: $return_status"
echo "     Body: $http_body"
if [[ "$return_status" -ne 200 ]];
then
    echo "   ❌ Failed to get all chats."
    exit 1
fi
echo "   ✅ Successfully retrieved all chats."
sleep 1

echo "   - 📌 GET /chats/pinned"
call_endpoint "GET" "$CHATS_URL/pinned"
echo "     HTTP status: $return_status"
echo "     Body: $http_body"
if [[ "$return_status" -ne 200 ]];
then
    echo "   ❌ Failed to get pinned chats."
    exit 1
fi
echo "   ✅ Successfully retrieved pinned chats."
sleep 1

echo "   - 👤 GET /chats/:jid"
call_endpoint "GET" "$CHATS_URL/$JID"
echo "     HTTP status: $return_status"
echo "     Body: $http_body"
if [[ "$return_status" -ne 200 ]];
then

    if [[ "$return_status" -eq 404 ]]; then
        echo "   ⚠️ Chat with JID $JID not found. This might be expected."
    else
        echo "   ❌ Failed to get chat by JID."
        exit 1
    fi
fi
echo "   ✅ Successfully retrieved chat by JID."
sleep 1

echo
echo "✅ All chat tests completed."
echo

echo "🧹 5. Cleaning up session…"
cleanup_raw=$(curl -sS -X DELETE "$AUTH_URL/remove" -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$sessionId\"}" -w "\n%{http_code}")
cleanup_body=$(echo "$cleanup_raw" | sed '$d')
cleanup_status=$(echo "$cleanup_raw" | tail -n1)
echo "   HTTP status: $cleanup_status"
echo "   Body: $cleanup_body"
if [[ "$cleanup_status" -eq 200 ]];
then
    echo "✅ Session deleted successfully."
else
    echo "❌ Session cleanup failed: $cleanup_body"
fi

echo
echo "🎉 Test cycle finished."
