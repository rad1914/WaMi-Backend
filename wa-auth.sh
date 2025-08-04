# @path: wa-auth.sh

set -euo pipefail

API_BASE_URL="http://localhost:3000/api"
AUTH_URL="$API_BASE_URL/auth"
MESSAGE_URL="$API_BASE_URL/message"
JID="5215539985884@s.whatsapp.net"   # fixed target JID

command_exists() {
    command -v "$1" &> /dev/null
}

if ! command_exists jq; then
    echo "❌ Error: 'jq' is not installed."
    echo "Please install jq to run this script (e.g., 'sudo apt-get install jq' or 'brew install jq')."
    exit 1
fi

if ! command_exists qrencode; then
    echo "❌ Error: 'qrencode' is not installed."
    echo "Please install qrencode to run this script (e.g., 'sudo apt-get install qrencode' or 'brew install qrencode')."
    exit 1
fi

echo "🔧 1. Creating new session…"
resp=$(curl -s -X POST "$AUTH_URL/create" -H "Content-Type: application/json")
sessionId=$(echo "$resp" | jq -r '.sessionId')

if [[ -z "$sessionId" || "$sessionId" == "null" ]]; then
  echo "❌ Failed to create session. Response: $resp"
  exit 1
fi

echo "✅ Session created. sessionId: $sessionId"
echo

echo "📲 2. Requesting QR code for authentication…"

current_qr=""
while true; do

    auth_status_resp=$(curl -s "$AUTH_URL/status?sessionId=$sessionId")
    authenticated=$(echo "$auth_status_resp" | jq -r '.authenticated')

    if [[ "$authenticated" == "true" ]]; then
        echo "✅ Authentication complete."
        break
    fi

    qr_resp=$(curl -s "$AUTH_URL/qr?sessionId=$sessionId")
    qr=$(echo "$qr_resp" | jq -r '.qr')

    if [[ -n "$qr" && "$qr" != "null" && "$qr" != "$current_qr" ]]; then
        echo
        echo "🖼️  QR Code Received. Please scan with your WhatsApp mobile app."
        qrencode -t UTF8 "$qr"
        echo "Waiting for authentication..."
        current_qr="$qr"
    fi

    sleep 5
done

echo
echo "✅ Authentication process finished."
echo

echo "⏳ 3. Verifying authentication status…"
status=$(curl -s "$AUTH_URL/status?sessionId=$sessionId" | jq -r '.authenticated')
echo "🔒 Status: authenticated: $status"
if [[ "$status" != "true" ]]; then
    echo "❌ Authentication failed. Exiting."
    exit 1
fi
echo

echo "⏱️  Waiting 8 seconds before starting messaging tests…"
sleep 45

echo "🚀 4. Starting messaging endpoint tests…"

SESSION_HEADER="-H \"x-session-id: $sessionId\""
CONTENT_HEADER="-H \"Content-Type: application/json\""

echo "   - 📝 Test: POST /message/send (text)"
send_resp=$(curl -s -X POST "$MESSAGE_URL/send" $SESSION_HEADER $CONTENT_HEADER \
  -d "{\"jid\": \"$JID\", \"type\": \"text\", \"content\": \"Hello from the test script! 👋\"}")
messageId=$(echo "$send_resp" | jq -r '.key.id')
if [[ -z "$messageId" || "$messageId" == "null" ]]; then
    echo "   ❌ FAILED to send text message. Response: $send_resp"
    exit 1
fi
echo "   ✅ Sent. Message ID: $messageId"
sleep 2

echo "   - ↪️  Test: POST /message/reply"
curl -s -X POST "$MESSAGE_URL/reply" $SESSION_HEADER $CONTENT_HEADER \
  -d "{\"jid\": \"$JID\", \"content\": \"This is a reply.\", \"quotedMessageId\": \"$messageId\"}" > /dev/null
echo "   ✅ Reply sent."
sleep 2

echo "   - 👍 Test: POST /message/react"
curl -s -X POST "$MESSAGE_URL/react" $SESSION_HEADER $CONTENT_HEADER \
  -d "{\"jid\": \"$JID\", \"messageId\": \"$messageId\", \"emoji\": \"🚀\"}" > /dev/null
echo "   ✅ Reaction sent."
sleep 2

echo "   - ✍️  Test: POST /message/edit"
curl -s -X POST "$MESSAGE_URL/edit" $SESSION_HEADER $CONTENT_HEADER \
  -d "{\"jid\": \"$JID\", \"messageId\": \"$messageId\", \"newText\": \"This message has been edited.\"}" > /dev/null
echo "   ✅ Edit sent."
sleep 2

echo "   - ⏩ Test: POST /message/forward"
curl -s -X POST "$MESSAGE_URL/forward" $SESSION_HEADER $CONTENT_HEADER \
  -d "{\"to\": \"$JID\", \"message\": $send_resp}" > /dev/null
echo "   ✅ Forward sent."
sleep 2

echo "   - 🖼️  Test: POST /message/send (image)"
curl -s -X POST "$MESSAGE_URL/send" $SESSION_HEADER $CONTENT_HEADER \
  -d "{\"jid\": \"$JID\", \"type\": \"image\", \"content\": \"https://i.imgur.com/LPVsY29.jpeg\", \"options\": {\"caption\": \"Test Image\"}}" > /dev/null
echo "   ✅ Image sent."
sleep 2

echo "   - 🗑️  Test: POST /message/delete"
curl -s -X POST "$MESSAGE_URL/delete" $SESSION_HEADER $CONTENT_HEADER \
  -d "{\"jid\": \"$JID\", \"messageId\": \"$messageId\"}" > /dev/null
echo "   ✅ Delete command sent."
echo
echo "✅ All messaging tests complete."
echo

echo "🧹 5. Cleaning up session…"
delete_resp=$(curl -s -X DELETE "$AUTH_URL/remove" $CONTENT_HEADER \
  -d "{\"sessionId\": \"$sessionId\"}")

success=$(echo "$delete_resp" | jq -r '.success')
if [[ "$success" == "true" ]]; then
    echo "✅ Session deleted successfully."
else
    echo "❌ Failed to delete session. Response: $delete_resp"
fi

echo
echo "🎉 Full test cycle finished!"
