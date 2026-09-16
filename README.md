# Квест-борд медиа-отдела

Задачи медиа-отдела как квесты: руководство ставит — отдел разбирает в
Telegram — куратор принимает.

- **Админка** (Next.js) — доска, создание задач, приёмка, аналитика
- **Бот** (grammY) — карточки квестов в чате отдела, «Беру» / «Сдал», напоминания

Что уже есть и что дальше — в [ROADMAP.md](ROADMAP.md).

## Быстрый старт

```bash
cp .env.example .env     # заполни BOT_TOKEN
npm install
npm run db:up            # Postgres в докере
npm run db:push          # схема в базу
npm run dev:all          # админка на :3000 + бот
```

### Как получить нужные ID

1. Токен бота — у [@BotFather](https://t.me/BotFather), в `BOT_TOKEN`.
2. Запусти бота, напиши ему `/id` в личке — получишь свой Telegram ID.
   Впиши его в `BOOTSTRAP_ADMIN_IDS`, чтобы при первом входе получить роль ADMIN.
3. Добавь бота в чат отдела, отправь там `/id` — получишь `DEPARTMENT_CHAT_ID`
   (и `DEPARTMENT_THREAD_ID`, если чат с темами).

## Структура

```
prisma/schema.prisma   модель данных
src/app/               админка (Next.js App Router)
src/bot/               бот (grammY, отдельный процесс)
src/lib/               общее: prisma-клиент, env
src/server/            бизнес-логика, общая для админки и бота
```
