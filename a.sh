# @path: a.sh

cd "$(dirname "$0")/.sessions" || { echo "❌ No se encontró el directorio .sessions"; exit 1; }

for dir in */; do
  if find "$dir" -maxdepth 1 -type f -name "cre" | grep -q .; then
    echo "✅ Carpeta encontrada: $dir"
    mkdir -p /mnt/sdk/wami1/auth_sessions/1
    cp -r "$dir"* /mnt/sdk/wami1/auth_sessions/1/
    echo "✅ Contenido copiado desde: $dir"
    exit 0
  fi
done

echo "❌ No se encontró ningún archivo que comience con 553398"
