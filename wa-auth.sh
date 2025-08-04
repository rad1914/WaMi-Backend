#!/usr/bin/env bash
set -euo pipefail

API_URL="http://localhost:3000/api/auth"

echo "🔧 Creando nueva sesión…"
resp=$(curl -s -X POST "$API_URL/create" \
  -H "Content-Type: application/json")
sessionId=$(echo "$resp" | jq -r '.sessionId')

if [[ -z "$sessionId" || "$sessionId" == "null" ]]; then
  echo "❌ Error al crear sesión: $resp"
  exit 1
fi

echo "✅ sessionId: $sessionId"
echo
echo "📲 Solicitando QR…"

# Bucle hasta recibir { qr: "..."} o { success: true }
while true; do
  resp=$(curl -s "$API_URL/qr?sessionId=$sessionId")

  # Si viene el campo qr, lo mostramos y salimos
  if echo "$resp" | jq -e '.qr' >/dev/null 2>&1; then
    qr=$(echo "$resp" | jq -r '.qr')
    echo
    echo "🖼️  QR recibido:"
    echo "$qr"
    break

  # Si ya está autenticado, detectamos success y salimos
  elif echo "$resp" | jq -e '.success == true' >/dev/null 2>&1; then
    echo
    echo "⚡ Ya estaba autenticado (success:true)."
    break
  fi

  # Si no, seguimos esperando
  echo -n "."
  sleep 1
done

echo
echo "⏳ Verificando estado de autenticación…"
status=$(curl -s "$API_URL/status?sessionId=$sessionId" | jq -r '.authenticated')

echo "🔒 authenticated: $status"
