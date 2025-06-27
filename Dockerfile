FROM mehfius/node-puppeteer-ngrok
ENV NGROK_AUTHTOKEN=2z6jivtLmQOqhF19mRKpBbElFHz_6rc6MMgYE6QX2GmWejsLN
ENV NGROK_URL=fleet-glowing-herring.ngrok-free.app
WORKDIR /app
COPY . .
RUN npm install
RUN npx puppeteer browsers install chrome --skip-chrome-check
COPY entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
CMD []
