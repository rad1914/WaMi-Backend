# @path: wa-messaging.sh

set -euo pipefail

API_BASE_URL="http://localhost:3000/api"
AUTH_URL="$API_BASE_URL/auth"
MESSAGE_URL="$API_BASE_URL/message"
JID="5215539985884@s.whatsapp.net"   # fixed target JID

call_endpoint() {
    local method=$1 url=$2 data=$3

    local resp
    resp=$(curl -sS -X "$method" "$url" \
        -H "x-session-id: $sessionId" \
        -H "Content-Type: application/json" \
        -d "$data" \
        -w "\n%{http_code}")

    http_body=$(echo "$resp" | sed '$d')
    http_status=$(echo "$resp" | tail -n1)
    echo "$http_body"  # imprime body
    return_status=$http_status
}

echo "🔧 1. Using static session ID…"
sessionId="07677b8b-e22b-43ac-8308-1fc0692b8987"

echo "⏳ 2. Initializing session on server…"
reload_raw=$(curl -sS -X POST "$AUTH_URL/reload" -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$sessionId\"}" -w "\n%{http_code}")
reload_body=$(echo "$reload_raw" | sed '$d')
reload_status=$(echo "$reload_raw" | tail -n1)
echo "   HTTP status: $reload_status"
echo "   Body: $reload_body"
if [[ "$reload_status" -ne 200 ]]; then
    echo "❌ Falló inicialización de sesión. Salida: $reload_body"
    exit 1
fi
reloaded=$(echo "$reload_body" | jq -r '.reloaded')
if [[ "$reloaded" != "true" ]]; then
    echo "❌ El servidor no reinició la sesión correctamente: $reload_body"
    exit 1
fi
echo "✅ Sesión creada: $sessionId"
echo

echo "⏳ 3. Verificando estado de autenticación…"
status_raw=$(curl -sS "$AUTH_URL/status?sessionId=$sessionId" -w "\n%{http_code}")
status_body=$(echo "$status_raw" | sed '$d')
status_code=$(echo "$status_raw" | tail -n1)
echo "   HTTP status: $status_code"
echo "   Body: $status_body"
if [[ "$status_code" -ne 200 ]]; then
    echo "❌ Error al verificar estado: $status_body"
    exit 1
fi
authenticated=$(echo "$status_body" | jq -r '.authenticated')
echo "🔒 Authenticated: $authenticated"
if [[ "$authenticated" != "true" ]]; then
    echo "❌ No está autenticado."
    exit 1
fi
echo

echo "🚀 4. Iniciando pruebas de mensajería…"

echo "   - 📝 POST /message/send (text)"
call_endpoint "POST" "$MESSAGE_URL/send" "{\"jid\":\"$JID\",\"type\":\"text\",\"content\":\"Hello from the test script! 👋\"}"
echo "     HTTP status: $return_status"
echo "     Body: $http_body"
if [[ "$return_status" -ne 200 && "$return_status" -ne 201 ]]; then
    echo "   ❌ Falló envío de texto."
    exit 1
fi
messageId=$(echo "$http_body" | jq -r '.key.id')
echo "   ✅ Sent. Message ID: $messageId"
sleep 2

echo "   - ↪️ POST /message/reply"
call_endpoint "POST" "$MESSAGE_URL/reply" "{\"jid\":\"$JID\",\"content\":\"This is a reply.\",\"quotedMessageId\":\"$messageId\"}"
echo "     HTTP status: $return_status"
echo "     Body: $http_body"
if [[ "$return_status" -ne 200 ]]; then
    echo "   ❌ Falló reply."
    exit 1
fi
echo "   ✅ Reply enviado."
sleep 2

echo "   - 👍 POST /message/react"
call_endpoint "POST" "$MESSAGE_URL/react" "{\"jid\":\"$JID\",\"messageId\":\"$messageId\",\"emoji\":\"🚀\"}"
echo "     HTTP status: $return_status"
echo "     Body: $http_body"
if [[ "$return_status" -ne 200 ]]; then
    echo "   ❌ Falló reacción."
    exit 1
fi
echo "   ✅ Reaction enviada."
sleep 2

echo "   - ✍️ POST /message/edit"
call_endpoint "POST" "$MESSAGE_URL/edit" "{\"jid\":\"$JID\",\"messageId\":\"$messageId\",\"newText\":\"This message has been edited.\"}"
echo "     HTTP status: $return_status"
echo "     Body: $http_body"
if [[ "$return_status" -ne 200 ]]; then
    echo "   ❌ Falló edición."
    exit 1
fi
echo "   ✅ Edit enviado."
sleep 2

echo "   - ⏩ POST /message/forward"
call_endpoint "POST" "$MESSAGE_URL/forward" "{\"to\":\"$JID\",\"message\":$http_body}"
echo "     HTTP status: $return_status"
echo "     Body: $http_body"
if [[ "$return_status" -ne 200 ]]; then
    echo "   ❌ Falló forward."
    exit 1
fi
echo "   ✅ Forward enviado."
sleep 2

echo "   - 🖼️ POST /message/send (image)"
call_endpoint "POST" "$MESSAGE_URL/send" "{\"jid\":\"$JID\",\"type\":\"image\",\"content\":\"https://i.imgur.com/LPVsY29.jpeg\",\"options\":{\"caption\":\"Test Image\"}}"
echo "     HTTP status: $return_status"
echo "     Body: $http_body"
if [[ "$return_status" -ne 200 && "$return_status" -ne 201 ]]; then
    echo "   ❌ Falló envío de imagen."
    exit 1
fi
echo "   ✅ Imagen enviada."
sleep 2

echo "   - 🗑️ POST /message/delete"
call_endpoint "POST" "$MESSAGE_URL/delete" "{\"jid\":\"$JID\",\"messageId\":\"$messageId\"}"
echo "     HTTP status: $return_status"
echo "     Body: $http_body"
if [[ "$return_status" -ne 200 ]]; then
    echo "   ❌ Falló delete."
    exit 1
fi
echo "   ✅ Delete enviado."
echo
echo "✅ Todas las pruebas de mensajería completadas."
echo

echo "🧹 5. Limpiando sesión…"
cleanup_raw=$(curl -sS -X DELETE "$AUTH_URL/remove" -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$sessionId\"}" -w "\n%{http_code}")
cleanup_body=$(echo "$cleanup_raw" | sed '$d')
cleanup_status=$(echo "$cleanup_raw" | tail -n1)
echo "   HTTP status: $cleanup_status"
echo "   Body: $cleanup_body"
if [[ "$cleanup_status" -eq 200 ]]; then
    echo "✅ Sesión eliminada correctamente."
else
    echo "❌ Falló eliminación de sesión: $cleanup_body"
fi

echo
echo "🎉 Ciclo de pruebas finalizado."
