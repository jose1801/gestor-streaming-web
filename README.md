# Gestor de cuentas de streaming (HTML/CSS/JS + Supabase)

Sitio estático puro (sin build, sin servidor propio). La base de datos vive
en Supabase (Postgres en la nube + autenticación).

## 1. Crear el proyecto en Supabase

1. Ve a https://supabase.com → crea una cuenta gratis → "New project".
2. Cuando esté listo, ve a **SQL Editor** → "New query", pega todo el
   contenido de `supabase.sql` (de este proyecto) y dale **Run**. Esto crea
   las tablas `cuentas` y `perfiles`, con seguridad para que cada usuario
   solo vea sus propios datos.
3. Ve a **Authentication → Users → Add user** y crea TU usuario (el correo y
   contraseña con los que vas a entrar al panel). No actives registro público,
   solo crea tu único usuario ahí manualmente.
4. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon public key**

## 2. Configurar el proyecto

Abre `config.js` y reemplaza los dos valores:

```js
window.SUPABASE_URL = "https://tu-proyecto.supabase.co";
window.SUPABASE_ANON_KEY = "tu-anon-key";
```

La `anon key` está pensada para exponerse en el navegador (por eso existen
las políticas de seguridad del paso 1) — no hay problema en que quede en el
código.

## 3. Correr en local

No necesita `npm install` ni build, son archivos estáticos. Dos formas:

**Con la extensión Live Server de VS Code (la más simple):**
1. Instala la extensión "Live Server" desde el Marketplace de VS Code.
2. Click derecho sobre `index.html` → "Open with Live Server".
3. Se abre en tu navegador en `http://127.0.0.1:5500`.

**Con la terminal:**
```bash
npx serve .
```
y abre la URL que te muestre.

Entra con el correo/contraseña que creaste en el paso 1.3.

## 4. Subir a GitHub

```bash
git init
git add .
git commit -m "Gestor de cuentas de streaming"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/gestor-streaming-web.git
git push -u origin main
```

## 5. Desplegar en Vercel

1. vercel.com → Add New → Project → importa el repo.
2. Framework Preset: **Other** (no hay build, son archivos estáticos).
3. Deploy.

Ya está — abres la URL que te da Vercel desde cualquier dispositivo y
funciona igual, apuntando a la misma base de datos de Supabase.

## Uso diario

- Entra con tu correo/contraseña.
- "+" en la barra lateral agrega una cuenta nueva con sus 5 perfiles vacíos.
- Click en un perfil → "Vender" → nombre del comprador, contacto, fecha de
  venta, duración en días y precio. El estado (Activo / Por vencer / Vencido)
  se calcula solo.
- "Liberar" limpia el perfil para revenderlo.
