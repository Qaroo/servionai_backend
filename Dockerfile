FROM node:18-slim

# משתני סביבה
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV SESSIONS_DIR=/sessions

# התקנת תלויות נדרשות
RUN apt-get update \
    && apt-get install -y wget gnupg ca-certificates \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get purge --auto-remove -y curl \
    && rm -rf /src/*.deb

# יצירת תיקיות הפרויקט
WORKDIR /app

# העתקת קבצי package.json ו-package-lock.json
COPY package*.json ./

# התקנת תלויות npm
RUN npm ci --only=production

# העתקת שאר קבצי הפרויקט
COPY . .

# יצירת תיקיית sessions עם הרשאות מתאימות
RUN mkdir -p /sessions \
    && chmod 777 /sessions

# חשיפת פורט
EXPOSE 5001

# הפקודה להרצה
CMD ["node", "index.js"] 