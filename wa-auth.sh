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

echo
echo "🎉 Full test cycle finished!"
