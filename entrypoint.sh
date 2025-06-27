#!/bin/sh
ngrok config add-authtoken "$NGROK_AUTHTOKEN"
echo $NGROK_AUTHTOKEN
npm start &
exec ngrok http --url="$NGROK_URL" 3000