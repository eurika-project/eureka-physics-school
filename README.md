# «Эврика!» — физика в космосе: онлайн-версия для школ

Интерактивный курс физики для 7 класса: фронтенд (`index.html`) и бэкенд (Node.js + Express + PostgreSQL) в одном приложении.

## Что внутри
- аккаунты, результаты, анкеты и прогресс хранятся в PostgreSQL;
- пароли — bcrypt-хэши, сессия — HttpOnly cookie (JWT);
- учитель регистрируется по коду доступа, указывает школу и город;
- серверная панель результатов для учителя;
- service worker кэширует оболочку сайта; если интернет пропал, ответы встают в очередь и отправляются при возвращении сети.

## Структура
```
index.html            интерфейс курса
public/server-sync.js связывает интерфейс с сервером
public/sw.js          service worker
server/               Express API
database/schema.sql   схема БД
scripts/              migrate, seed-admin
Dockerfile, render.yaml
```

## Локальный запуск
1. Node.js 20+ и PostgreSQL.
2. `cp .env.example .env`, заполнить `DATABASE_URL`, `JWT_SECRET`, `TEACHER_CODE`.
3. `npm ci`
4. `npm run migrate`
5. `npm run seed-admin` (по желанию)
6. `npm start` → http://localhost:3000

## Развёртывание в Render
1. Создайте PostgreSQL и Web Service из этого репозитория (подойдёт `render.yaml` — Blueprint).
2. Задайте `DATABASE_URL`, `JWT_SECRET`, `TEACHER_CODE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
3. Миграция выполняется автоматически перед деплоем (`preDeployCommand`), либо вручную: `npm run migrate`.
4. Один раз выполните `npm run seed-admin` в shell сервиса.

Бесплатные тарифы могут «усыплять» сервис и удалять БД через время. Для постоянной доступности нужен платный тариф с резервным копированием PostgreSQL.

## Безопасность
Не публикуйте `.env`, пароли и `DATABASE_URL`. Задайте длинный случайный `JWT_SECRET` и свой `TEACHER_CODE`.
